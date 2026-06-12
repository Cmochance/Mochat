"""
学习模块业务服务（阶段一升级版）
- 文档解析（PDF / DOCX / TXT / Markdown）— 结构化增强
- 文本分块 — 动态大小 + 上下文窗口
- 混合检索（BM25 + TF-IDF）+ 轻量级重排
- 可选向量检索（sentence-transformers）
- AI 摘要 / 学习对话
"""

import io
import json
import logging
import math
import re
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Set, Tuple  # noqa: UP035

from ..db.models import MaterialChunk
from .ai_service import ai_service
from .knowledge_service import knowledge_service

logger = logging.getLogger(__name__)

# --------------- 文本提取（增强版） ---------------

# PDF 常见页眉页脚噪音模式
_PDF_HEADER_FOOTER_PATTERNS = [
    r"第\s*\d+\s*页",
    r"共\s*\d+\s*页",
    r"Page\s*\d+\s*(of|/)\s*\d+",
    r"\d{4}[-/]\d{1,2}[-/]\d{1,2}",
    r"©.*?\d{4}",
    r"www\.\S+",
    r"http[s]?://\S+",
]
_PDF_NOISE_RE = re.compile("|".join(_PDF_HEADER_FOOTER_PATTERNS), re.IGNORECASE)


def _clean_pdf_text(text: str) -> str:
    """清理 PDF 提取文本中的常见噪音（页眉页脚、页码等）"""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # 跳过纯页码行
        if re.match(r"^\d{1,4}$", stripped):
            continue
        # 跳过已知噪音模式（且行较短，避免误杀正文）
        if _PDF_NOISE_RE.search(stripped) and len(stripped) < 60:
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def extract_text_from_pdf(content: bytes) -> str:
    """从 PDF 提取文本，自动清理噪音"""
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(content))
        raw_text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return _clean_pdf_text(raw_text)
    except Exception as e:
        logger.warning("PDF 解析失败: %s", e)
        return ""


def extract_text_from_docx(content: bytes) -> str:
    """从 DOCX 提取文本，保留标题层级（Markdown 风格）"""
    try:
        from docx import Document

        doc = Document(io.BytesIO(content))
        parts: List[str] = []
        for para in doc.paragraphs:
            style_name = (para.style.name or "").lower()
            text = para.text.strip()
            if not text:
                continue
            if "heading 1" in style_name:
                parts.append(f"# {text}")
            elif "heading 2" in style_name:
                parts.append(f"## {text}")
            elif "heading 3" in style_name:
                parts.append(f"### {text}")
            else:
                parts.append(text)
        return "\n".join(parts)
    except Exception as e:
        logger.warning("DOCX 解析失败: %s", e)
        return ""


def extract_text_from_markdown(content: bytes) -> str:
    """从 Markdown 提取纯文本（保留结构）"""
    try:
        text = content.decode("utf-8", errors="ignore")
        # 简单清理：移除图片链接但保留文本
        text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
        # 保留链接文本
        text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
        return text
    except Exception as e:
        logger.warning("Markdown 解析失败: %s", e)
        return ""


def extract_text_from_txt(content: bytes) -> str:
    """从纯文本文件提取文本"""
    try:
        return content.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def extract_text(file_name: str, content: bytes) -> str:
    """根据文件类型自动提取文本"""
    name_lower = file_name.lower()
    if name_lower.endswith(".pdf"):
        return extract_text_from_pdf(content)
    elif name_lower.endswith(".docx"):
        return extract_text_from_docx(content)
    elif name_lower.endswith(".md"):
        return extract_text_from_markdown(content)
    elif name_lower.endswith(".txt"):
        return extract_text_from_txt(content)
    else:
        # 尝试作为纯文本读取
        return extract_text_from_txt(content)


# --------------- 智能分块（动态大小 + 上下文窗口） ---------------


def _count_tokens_approx(text: str) -> int:
    """粗略估算 token 数（中文约 1.5 字/token，英文约 4 字符/token）"""
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars / 4)


def _split_text_dynamic(
    text: str,
    max_tokens: int = 512,
    overlap_tokens: int = 64,
) -> List[str]:
    """
    动态分块：优先按段落分割，超长段落按句子分割，保证每块不超 max_tokens。
    相邻块之间有 overlap_tokens 的重叠，避免信息丢失。
    """
    if not text.strip():
        return []

    # 第一步：按段落分割
    paragraphs = re.split(r"\n{2,}", text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    chunks: List[str] = []
    current_chunk_parts: List[str] = []
    current_tokens = 0

    for para in paragraphs:
        para_tokens = _count_tokens_approx(para)

        # 如果单个段落就超长，按句子拆分
        if para_tokens > max_tokens:
            sentences = re.split(r"(?<=[。！？.!?\n])", para)
            sentences = [s.strip() for s in sentences if s.strip()]
            for sent in sentences:
                sent_tokens = _count_tokens_approx(sent)
                if current_tokens + sent_tokens > max_tokens and current_chunk_parts:
                    chunks.append("\n".join(current_chunk_parts))
                    # 保留最后一部分作为重叠
                    overlap_parts: List[str] = []
                    overlap_count = 0
                    for part in reversed(current_chunk_parts):
                        part_tokens = _count_tokens_approx(part)
                        if overlap_count + part_tokens > overlap_tokens:
                            break
                        overlap_parts.insert(0, part)
                        overlap_count += part_tokens
                    current_chunk_parts = overlap_parts
                    current_tokens = overlap_count
                current_chunk_parts.append(sent)
                current_tokens += sent_tokens
        else:
            if current_tokens + para_tokens > max_tokens and current_chunk_parts:
                chunks.append("\n".join(current_chunk_parts))
                # 重叠
                overlap_parts = []
                overlap_count = 0
                for part in reversed(current_chunk_parts):
                    part_tokens = _count_tokens_approx(part)
                    if overlap_count + part_tokens > overlap_tokens:
                        break
                    overlap_parts.insert(0, part)
                    overlap_count += part_tokens
                current_chunk_parts = overlap_parts
                current_tokens = overlap_count

            current_chunk_parts.append(para)
            current_tokens += para_tokens

    if current_chunk_parts:
        chunks.append("\n".join(current_chunk_parts))

    return chunks


# --------------- 混合检索（BM25 + TF-IDF + 轻量级重排） ---------------


def _tokenize(text: str) -> List[str]:
    """
    简单分词：中文按字/词分割，英文按空格分割，统一小写。
    """
    # 中文字符单独拆分，英文按空格
    tokens = []
    current_word = []
    for char in text:
        if "\u4e00" <= char <= "\u9fff":
            if current_word:
                tokens.append("".join(current_word).lower())
                current_word = []
            tokens.append(char)
        elif char.isalnum():
            current_word.append(char)
        else:
            if current_word:
                tokens.append("".join(current_word).lower())
                current_word = []
    if current_word:
        tokens.append("".join(current_word).lower())
    return tokens


def _compute_idf(documents_tokens: List[List[str]]) -> Dict[str, float]:
    """计算 IDF（逆文档频率）"""
    doc_count = len(documents_tokens)
    if doc_count == 0:
        return {}
    df: Dict[str, int] = defaultdict(int)
    for doc_tokens in documents_tokens:
        unique_tokens = set(doc_tokens)
        for token in unique_tokens:
            df[token] += 1
    idf = {}
    for token, freq in df.items():
        idf[token] = math.log((doc_count - freq + 0.5) / (freq + 0.5) + 1)
    return idf


def _bm25_score(
    query_tokens: List[str],
    doc_tokens: List[str],
    idf: Dict[str, float],
    avg_dl: float,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """计算 BM25 分数"""
    dl = len(doc_tokens)
    tf_counter = Counter(doc_tokens)
    score = 0.0
    for qt in query_tokens:
        if qt not in idf:
            continue
        tf = tf_counter.get(qt, 0)
        numerator = tf * (k1 + 1)
        denominator = tf + k1 * (1 - b + b * dl / avg_dl)
        score += idf[qt] * (numerator / denominator)
    return score


def _tfidf_score(
    query_vec: Dict[str, int],
    doc_vec: Dict[str, int],
    idf: Dict[str, float],
) -> float:
    """计算 TF-IDF 余弦相似度"""
    # 构建词表
    vocab = set(query_vec.keys()) | set(doc_vec.keys())
    if not vocab:
        return 0.0
    dot_product = 0.0
    query_norm = 0.0
    doc_norm = 0.0
    for term in vocab:
        q_val = query_vec.get(term, 0) * idf.get(term, 0)
        d_val = doc_vec.get(term, 0) * idf.get(term, 0)
        dot_product += q_val * d_val
        query_norm += q_val * q_val
        doc_norm += d_val * d_val
    if query_norm == 0 or doc_norm == 0:
        return 0.0
    return dot_product / (math.sqrt(query_norm) * math.sqrt(doc_norm))


def _rerank_score(
    query_token_set: Set[str],
    query_text: str,
    doc_tokens: List[str],
    doc_text: str,
    bm25: float,
    tfidf: float,
) -> float:
    """
    轻量级重排：综合 BM25、TF-IDF、查询词覆盖率、短语匹配、词项密度。
    """
    # 1. 查询词覆盖率
    doc_token_set = set(doc_tokens)
    coverage = len(query_token_set & doc_token_set) / len(query_token_set) if query_token_set else 0.0

    # 2. 短语匹配（查询作为子串在文档中出现）
    phrase_match = 1.0 if query_text.lower() in doc_text.lower() else 0.0

    # 3. 词项密度（匹配词数 / 文档长度，偏好短文档）
    match_count = sum(1 for t in doc_tokens if t in query_token_set)
    density = match_count / len(doc_tokens) if doc_tokens else 0.0

    # 加权组合
    final = 0.35 * bm25 + 0.25 * tfidf + 0.20 * coverage + 0.15 * phrase_match + 0.05 * density
    return final


def retrieve_relevant_chunks(
    query: str,
    chunks: List[MaterialChunk],
    top_k: int = 5,
) -> List[Tuple[MaterialChunk, float]]:
    """
    混合检索：BM25 + TF-IDF + 轻量级重排，返回最相关的 top_k 个分块及得分。
    """
    if not chunks:
        return []

    # 分词
    query_tokens = _tokenize(query)
    query_vec = Counter(query_tokens)
    query_token_set = set(query_tokens)

    # 为所有分块建立语料库用于 IDF 计算
    all_doc_tokens = [_tokenize(c.content) for c in chunks]
    idf = _compute_idf(all_doc_tokens)

    # 平均文档长度
    total_len = sum(len(dt) for dt in all_doc_tokens)
    avg_dl = total_len / len(all_doc_tokens) if all_doc_tokens else 1.0

    scored: List[Tuple[MaterialChunk, float]] = []

    for i, chunk in enumerate(chunks):
        chunk_tokens = all_doc_tokens[i]
        chunk_vec = Counter(chunk_tokens)

        # 计算 BM25 得分
        bm25 = _bm25_score(query_tokens, chunk_tokens, idf, avg_dl)

        # 计算 TF-IDF 得分
        tfidf = _tfidf_score(query_vec, chunk_vec, idf)

        # 轻量级重排
        final_score = _rerank_score(
            query_token_set,
            query,
            chunk_tokens,
            chunk.content,
            bm25,
            tfidf,
        )
        scored.append((chunk, final_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


async def hybrid_retrieve_chunks(
    user_id: int,
    query: str,
    db_chunks: List[MaterialChunk],
    top_k: int = 5,
) -> List[Tuple[MaterialChunk, float]]:
    """
    混合检索 2.0：融合 BM25 稀疏检索与 ChromaDB 语义向量检索
    """
    # 1. BM25 稀疏检索结果
    sparse_results = retrieve_relevant_chunks(query, db_chunks, top_k=top_k * 2)

    # 2. ChromaDB 语义向量检索结果
    try:
        semantic_texts = await knowledge_service.search_knowledge(user_id, query, top_k=top_k * 2)
    except Exception as e:
        logger.warning(f"向量检索失败，降级为纯 BM25 检索: {e}")
        semantic_texts = []

    # 构建已有的稀疏检索结果内容映射，用于去重
    sparse_contents = {chunk.content for chunk, _ in sparse_results}

    final_results: Dict[str, Tuple[MaterialChunk, float]] = {}

    # 稀疏结果权重 0.4
    for chunk, score in sparse_results:
        final_results[chunk.content] = (chunk, score * 0.4)

    # 向量结果权重 0.6
    for text in semantic_texts:
        if text in final_results:
            chunk, old_score = final_results[text]
            final_results[text] = (chunk, old_score + 0.6)
        else:
            # 如果向量召回了数据库中没有的新文本，构造一个临时的 MaterialChunk 对象
            # 注意：实际上 MaterialChunk 是 SQLAlchemy 模型，需要特殊处理
            # 在此我们假设用户上传的文档都已经入库到 db_chunks 中，如果未入库，则仅提升已有的结果
            pass

    # 按融合后的分数排序
    merged_list = sorted(final_results.values(), key=lambda x: x[1], reverse=True)
    return merged_list[:top_k]


# --------------- 可选向量检索（sentence-transformers） ---------------

_vector_model = None
_vector_model_name: Optional[str] = None


def _get_vector_model():
    """
    延迟加载 sentence-transformers 模型。
    如果未安装 sentence-transformers，返回 None（降级为纯文本检索）。
    """
    global _vector_model, _vector_model_name
    if _vector_model is not None:
        return _vector_model

    model_name = "all-MiniLM-L6-v2"
    try:
        from sentence_transformers import SentenceTransformer

        _vector_model = SentenceTransformer(model_name)
        _vector_model_name = model_name
        logger.info("sentence-transformers 模型加载成功: %s", model_name)
    except ImportError:
        logger.info("sentence-transformers 未安装，向量检索将跳过")
        _vector_model = False
    except Exception as e:
        logger.warning("sentence-transformers 模型加载失败: %s", e)
        _vector_model = False
    return _vector_model


def vector_search(
    query: str,
    chunks: List[MaterialChunk],
    top_k: int = 5,
    min_score: float = 0.3,
) -> List[Tuple[MaterialChunk, float]]:
    """
    基于 sentence-transformers 的向量语义检索。
    如果模型不可用，返回空列表（调用方应 fallback 到 BM25）。
    """
    model = _get_vector_model()
    if not model:
        return []
    if not chunks:
        return []

    try:
        import numpy as np

        doc_texts = [c.content for c in chunks]
        query_emb = model.encode([query], normalize_embeddings=True)
        doc_embs = model.encode(doc_texts, normalize_embeddings=True)
        similarities = np.dot(doc_embs, query_emb.T).flatten()
        scored = [(chunks[i], float(similarities[i])) for i in range(len(chunks))]
        scored = [(c, s) for c, s in scored if s >= min_score]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]
    except Exception as e:
        logger.warning("向量检索异常，fallback 到 BM25: %s", e)
        return []


def truncate_text(text: str, max_tokens: int = 6000) -> str:
    """粗略截断文本，避免超出模型上下文窗口"""
    max_chars = max_tokens * 4  # 粗略 1 token ≈ 4 字符
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n...(文本过长已截断)"


# --------------- Prompt 模板 ---------------

STUDY_CHAT_SYSTEM_PROMPT = """\
你是墨语（Mochat）的智能学习伴侣。你的任务是帮助用户理解学习资料。

请遵循以下原则：
1. 优先根据下方提供的参考资料片段回答
2. 如果参考资料中没有相关信息，可以基于你的知识补充，但需注明"以下为补充知识"
3. 回答要结构化、易理解，适当使用 Markdown 格式
4. 如果用户的问题涉及具体数据或公式，请原文引用参考资料

参考资料片段：
{context}
"""

SUMMARY_SYSTEM_PROMPT = """\
请为以下学习资料生成一份结构化的摘要，要求：
1. 提取 3-5 个核心要点
2. 每个要点用一句话概括
3. 最后给出一段 100 字以内的总体概述
4. 使用中文，语言简洁专业

资料内容：
{content}
"""

FLASHCARD_SYSTEM_PROMPT = """\
根据以下学习资料，生成一组闪卡（Flashcard），要求：
1. 提取关键概念、定义、公式或重要事实
2. 每张闪卡包含"正面"（问题/概念）和"背面"（答案/解释）
3. 生成 {count} 张闪卡
4. 返回 JSON 数组格式：[{{"front": "...", "back": "..."}}]
5. 只返回 JSON，不要其他内容

资料内容：
{content}
"""

QUIZ_SYSTEM_PROMPT = """\
根据以下学习资料，生成一份自适应测验试卷，要求：
1. 包含 {count} 道题，难度从易到难递增
2. 题型为单选题（4 选 1）
3. 每题包含：question（题目）、options（4 个选项数组）、answer（正确答案，如 "A"）、explanation（解析）
4. 返回 JSON 数组格式：[{{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": "A", "explanation": "..."}}]
5. 只返回 JSON，不要其他内容

资料内容：
{content}
"""

ADAPTIVE_QUIZ_SYSTEM_PROMPT = """\
你是墨语（Mochat）的智能出题系统。根据学习资料和用户的错题记录，生成自适应强化测验。

**出题原则：**
1. 优先针对用户薄弱知识点（错题涉及的概念）出变体题
2. 难度分布：40% 基础题 + 40% 中等题 + 20% 挑战题
3. 每道题必须与资料内容相关，不得超出资料范围

**输出格式（JSON 数组）：**
[
  {{
    "question_type": "single",
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "answer": "A",
    "explanation": "解析",
    "knowledge_point": "涉及知识点"
  }},
  {{
    "question_type": "boolean",
    "question": "判断题内容",
    "options": ["A. 正确", "B. 错误"],
    "answer": "A",
    "explanation": "解析",
    "knowledge_point": "涉及知识点"
  }}
]

**错题记录（用户历史错误，优先围绕这些知识点出题）：**
{wrong_questions_context}

**学习资料：**
{content}

请直接返回 JSON 数组，不要其他内容。题目数量：10-15 道。
"""


async def _retrieve_context(material_id: int, query: str, db: AsyncSession, top_k: int = 5) -> str:
    """检索相关上下文"""
    chunks = await crud.get_material_chunks(db, material_id)
    if not chunks:
        return ""

    # 使用混合检索
    relevant = retrieve_relevant_chunks(query, chunks, top_k=top_k)
    if not relevant:
        # fallback: 取前几个块
        return "\n---\n".join(c.content for c in chunks[:3])

    return "\n---\n".join(chunk.content for chunk, score in relevant)


async def study_chat_stream(
    material_id: int,
    user_message: str,
    chat_history: List[Dict[str, str]],
    db: AsyncSession,
):
    """学习伴侣对话（流式输出）"""
    # 检索相关上下文
    context = await _retrieve_context(material_id, user_message, db)

    system_prompt = STUDY_CHAT_SYSTEM_PROMPT.format(context=context)

    messages = []
    for msg in chat_history[-10:]:  # 最近 10 条历史
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    async for chunk_text in ai_service.chat_stream(
        messages=messages,
        system_prompt=system_prompt,
    ):
        yield chunk_text


async def generate_summary(material_id: int, db: AsyncSession) -> str:
    """生成资料摘要"""
    material = await crud.get_material_by_id(db, material_id)
    if not material:
        raise ValueError("资料不存在")

    content = truncate_text(material.raw_text, max_tokens=4000)
    prompt = SUMMARY_SYSTEM_PROMPT.format(content=content)

    thinking, result = await ai_service.chat_simple(
        messages=[{"role": "user", "content": "请生成摘要"}],
        system_prompt=prompt,
    )
    return result


async def generate_flashcards(
    material_id: int,
    count: int,
    db: AsyncSession,
) -> List[Dict[str, str]]:
    """生成闪卡"""
    material = await crud.get_material_by_id(db, material_id)
    if not material:
        raise ValueError("资料不存在")

    content = truncate_text(material.raw_text, max_tokens=4000)
    prompt = FLASHCARD_SYSTEM_PROMPT.format(content=content, count=count)

    try:
        thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请生成闪卡"}],
            system_prompt=prompt,
        )
        # 尝试解析 JSON
        match = re.search(r"\[.*\]", result, re.DOTALL)
        if match:
            return json.loads(match.group())
        return []
    except Exception as e:
        logger.error("生成闪卡失败: %s", e)
        raise


async def generate_quiz(
    material_id: int,
    count: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """生成测验"""
    material = await crud.get_material_by_id(db, material_id)
    if not material:
        raise ValueError("资料不存在")

    content = truncate_text(material.raw_text, max_tokens=4000)
    prompt = QUIZ_SYSTEM_PROMPT.format(content=content, count=count)

    try:
        thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请生成测验"}],
            system_prompt=prompt,
        )
        match = re.search(r"\[.*\]", result, re.DOTALL)
        if match:
            return json.loads(match.group())
        return []
    except Exception as e:
        logger.error("生成测验失败: %s", e)
        raise


async def generate_adaptive_quiz(
    material_id: int,
    user_id: int,
    db: AsyncSession,
) -> List[Dict[str, Any]]:
    """
    生成自适应测验：基于错题记录 + 学习资料，由 LLM 动态生成强化题目
    """
    material = await crud.get_material_by_id(db, material_id)
    if not material:
        raise ValueError("资料不存在")

    content = truncate_text(material.raw_text, max_tokens=3000)

    # 获取错题记录
    wrong_questions = await crud.get_wrong_questions(db, material_id, user_id)
    if wrong_questions:
        wrong_questions_context = "\n".join(
            [
                f"- 错误题目：{q.question_content}\n  用户答案：{q.user_answer}\n  正确答案：{q.correct_answer}\n  知识点：{q.knowledge_point}"
                for q in wrong_questions[:8]
            ]
        )
    else:
        wrong_questions_context = "暂无具体错题记录，请围绕资料核心知识点生成基础题目。"

    prompt = ADAPTIVE_QUIZ_SYSTEM_PROMPT.format(
        content=truncated,
        wrong_questions_context=wrong_questions_context,
    )

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请为我生成自适应强化测验试卷。"}],
            system_prompt=prompt,
        )
        import re as _re

        match = _re.search(r"\[.*\]", result, re.DOTALL)
        if match:
            questions = json.loads(match.group())
            valid = []
            for q in questions:
                if not isinstance(q, dict):
                    continue
                q_type = q.get("question_type")
                if q_type not in ("single", "boolean"):
                    continue
                if q_type == "single":
                    opts = q.get("options")
                    if not isinstance(opts, list) or len(opts) != 4:
                        continue
                valid.append(q)
            return valid
        return []
    except Exception as e:
        logger.error("生成自适应测验失败: %s", e)
        raise
