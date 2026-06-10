"""
学习模块业务服务
- 文档解析（PDF / DOCX / TXT / Markdown）
- 文本分块
- 简易检索（词频余弦相似度）
- AI 摘要 / 学习对话
"""
import io
import json
import logging
import math
import re
from collections import Counter
from typing import List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import User, LearningMaterial, MaterialChunk
from .ai_service import ai_service

logger = logging.getLogger(__name__)

# --------------- 文本提取 ---------------

def _extract_text_from_pdf(data: bytes) -> str:
    """从 PDF 二进制数据中提取文本"""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)
    except ImportError:
        logger.error("pypdf 未安装，无法解析 PDF")
        raise ValueError("服务端未安装 PDF 解析库，请联系管理员")
    except Exception as e:
        logger.error("PDF 解析失败: %s", e)
        raise ValueError(f"PDF 解析失败: {e}")


def _extract_text_from_docx(data: bytes) -> str:
    """从 DOCX 二进制数据中提取文本"""
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except ImportError:
        logger.error("python-docx 未安装，无法解析 DOCX")
        raise ValueError("服务端未安装 DOCX 解析库，请联系管理员")
    except Exception as e:
        logger.error("DOCX 解析失败: %s", e)
        raise ValueError(f"DOCX 解析失败: {e}")


def extract_text(filename: str, data: bytes) -> Tuple[str, str]:
    """
    根据文件扩展名提取文本。
    返回 (file_type, extracted_text)
    """
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return "pdf", _extract_text_from_pdf(data)
    elif lower.endswith(".docx"):
        return "docx", _extract_text_from_docx(data)
    elif lower.endswith(".md"):
        return "md", data.decode("utf-8", errors="replace")
    elif lower.endswith(".txt"):
        return "txt", data.decode("utf-8", errors="replace")
    else:
        # 未知类型，尝试当纯文本处理
        return "txt", data.decode("utf-8", errors="replace")


# --------------- 文本分块 ---------------

def chunk_text(text: str, max_chars: int = 1000, overlap_chars: int = 100) -> List[str]:
    """
    将文本分块。优先按段落分割，超长段落按句子分割。
    每块目标长度 <= max_chars 字符。
    """
    # 按双换行分段
    paragraphs = re.split(r'\n{2,}', text.strip())
    chunks: List[str] = []

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(para) <= max_chars:
            chunks.append(para)
        else:
            # 按句子分割
            sentences = re.split(r'(?<=[。！？.!?\n])', para)
            current = ""
            for sent in sentences:
                if not sent.strip():
                    continue
                if len(current) + len(sent) <= max_chars:
                    current += sent
                else:
                    if current.strip():
                        chunks.append(current.strip())
                    current = sent
            if current.strip():
                chunks.append(current.strip())

    # 添加重叠（简单做法：每块末尾保留 overlap_chars 个字符拼到下一块开头）
    if overlap_chars > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = chunks[i - 1][-overlap_chars:]
            overlapped.append(tail + chunks[i])
        chunks = overlapped

    return chunks


# --------------- 简易检索 ---------------

def _tokenize(text: str) -> List[str]:
    """简易分词：按非字母数字字符拆分，转小写"""
    return re.findall(r'[\w\u4e00-\u9fff]+', text.lower())


def _cosine_similarity(vec_a: Counter, vec_b: Counter) -> float:
    """计算两个词频向量的余弦相似度"""
    common = set(vec_a.keys()) & set(vec_b.keys())
    if not common:
        return 0.0
    dot = sum(vec_a[k] * vec_b[k] for k in common)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def retrieve_relevant_chunks(
    query: str,
    chunks: List[MaterialChunk],
    top_k: int = 5,
) -> List[Tuple[MaterialChunk, float]]:
    """
    简易检索：基于词频余弦相似度，返回最相关的 top_k 个分块及其得分。
    """
    query_vec = Counter(_tokenize(query))
    scored: List[Tuple[MaterialChunk, float]] = []

    for chunk in chunks:
        chunk_vec = Counter(_tokenize(chunk.content))
        score = _cosine_similarity(query_vec, chunk_vec)
        scored.append((chunk, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


# --------------- AI 交互 ---------------

SUMMARY_SYSTEM_PROMPT = """你是一位专业的学习助手。请根据以下学习资料内容，生成一份结构化的学习摘要。

要求：
1. 提炼核心要点（3-8 条）
2. 列出关键概念及简要解释
3. 用中文回答
4. 格式使用 Markdown

---
资料内容：
{content}"""


STUDY_CHAT_SYSTEM_PROMPT = """你是一位专业的学习辅导助手。用户正在学习一份资料，你需要基于资料内容回答用户的问题。

规则：
1. 优先根据下方提供的参考资料片段回答
2. 如果参考资料中没有相关信息，可以基于你的知识补充，但需注明"以下为补充知识"
3. 回答要清晰、有条理，必要时使用列表和标题
4. 用中文回答（用户用英文提问则用英文回答）

---
参考资料片段：
{context}"""


async def generate_summary(content: str) -> str:
    """调用 AI 生成学习资料摘要"""
    # 截断过长内容，避免超出上下文窗口
    truncated = content[:15000] if len(content) > 15000 else content
    prompt = SUMMARY_SYSTEM_PROMPT.format(content=truncated)
    try:
        _thinking, summary = await ai_service.chat_complete(
            messages=[{"role": "user", "content": "请为我生成学习摘要。"}],
            system_prompt=prompt,
        )
        return summary
    except Exception as e:
        logger.error("生成摘要失败: %s", e)
        raise


async def study_chat_stream(
    user_message: str,
    context_chunks: List[str],
    history: List[dict],
    model: Optional[str] = None,
):
    """
    学习对话流式生成。
    context_chunks: 检索到的参考资料片段文本列表
    history: 之前的对话历史 [{"role": "user"/"assistant", "content": "..."}]
    """
    context_text = "\n\n---\n\n".join(context_chunks) if context_chunks else "（无相关资料片段）"
    system_prompt = STUDY_CHAT_SYSTEM_PROMPT.format(context=context_text)

    messages = history + [{"role": "user", "content": user_message}]

    async for chunk in ai_service.chat_stream(messages=messages, system_prompt=system_prompt, model=model):
        yield chunk
