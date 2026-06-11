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

logger = logging.getLogger(__name__)

# --------------- 文本提取（增强版） ---------------

# PDF 常见页眉页脚噪音模式
_PDF_HEADER_FOOTER_PATTERNS = [
    r'第\s*\d+\s*页',
    r'共\s*\d+\s*页',
    r'Page\s*\d+\s*(of|/)\s*\d+',
    r'\d{4}[-/]\d{1,2}[-/]\d{1,2}',
    r'©.*?\d{4}',
    r'www\.\S+',
    r'http[s]?://\S+',
]
_PDF_NOISE_RE = re.compile('|'.join(_PDF_HEADER_FOOTER_PATTERNS), re.IGNORECASE)


def _clean_pdf_text(text: str) -> str:
    """清理 PDF 提取文本中的常见噪音（页眉页脚、页码等）"""
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # 跳过纯页码行
        if re.match(r'^\d{1,4}$', stripped):
            continue
        # 跳过已知噪音模式（且行较短，避免误杀正文）
        if _PDF_NOISE_RE.search(stripped) and len(stripped) < 50:
            continue
        cleaned.append(line)
    return '\n'.join(cleaned)


def _extract_text_from_pdf(data: bytes) -> str:
    """从 PDF 二进制数据中提取文本，附带噪音清理"""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(_clean_pdf_text(text))
        return "\n\n".join(pages)
    except ImportError:
        logger.error("pypdf 未安装，无法解析 PDF")
        raise ValueError("服务端未安装 PDF 解析库，请联系管理员")
    except Exception as e:
        logger.error("PDF 解析失败: %s", e)
        raise ValueError(f"PDF 解析失败: {e}")


def _extract_text_from_docx(data: bytes) -> str:
    """从 DOCX 二进制数据中提取文本，保留标题层级结构"""
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        paragraphs = []
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue
            style_name = (p.style.name or "").lower()
            # 检测标题样式并转为 Markdown 标记
            if "heading" in style_name or "标题" in style_name:
                level_match = re.search(r'(\d)', style_name)
                level = int(level_match.group(1)) if level_match else 1
                paragraphs.append(f"{'#' * level} {text}")
            else:
                paragraphs.append(text)
        return "\n\n".join(paragraphs)
    except ImportError:
        logger.error("python-docx 未安装，无法解析 DOCX")
        raise ValueError("服务端未安装 DOCX 解析库，请联系管理员")
    except Exception as e:
        logger.error("DOCX 解析失败: %s", e)
        raise ValueError(f"DOCX 解析失败: {e}")


def _extract_text_from_markdown(data: bytes) -> str:
    """解析 Markdown 文件"""
    return data.decode("utf-8", errors="replace")


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
        return "md", _extract_text_from_markdown(data)
    elif lower.endswith(".txt"):
        return "txt", data.decode("utf-8", errors="replace")
    else:
        return "txt", data.decode("utf-8", errors="replace")


# --------------- 文本分块（增强版） ---------------

def _split_by_headings(text: str) -> List[Tuple[str, str]]:
    """
    按 Markdown 标题拆分文本，返回 [(heading, body), ...] 列表。
    无标题段落的 heading 为空字符串。
    """
    lines = text.split("\n")
    sections: List[Tuple[str, str]] = []
    current_heading = ""
    current_body_lines: List[str] = []

    for line in lines:
        heading_match = re.match(r'^(#{1,6})\s+(.+)', line)
        if heading_match:
            # 保存上一段
            body = "\n".join(current_body_lines).strip()
            if body or current_heading:
                sections.append((current_heading, body))
            current_heading = heading_match.group(2).strip()
            current_body_lines = []
        else:
            current_body_lines.append(line)

    # 保存最后一段
    body = "\n".join(current_body_lines).strip()
    if body or current_heading:
        sections.append((current_heading, body))

    return sections


def chunk_text(text: str, max_chars: int = 1000, overlap_chars: int = 150) -> List[str]:
    """
    将文本分块。采用多级分割策略：
    1. 优先按标题结构分段
    2. 按段落分段
    3. 超长段落按句子分割
    每块目标长度 <= max_chars 字符，默认 overlap 为 150 字符。
    """
    # 第一级：尝试按标题拆分
    sections = _split_by_headings(text)

    if len(sections) <= 1:
        # 无有效标题，回退到纯段落分割
        sections = [("", s) for s in re.split(r'\n{2,}', text.strip()) if s.strip()]

    chunks: List[str] = []

    for heading, body in sections:
        if not body:
            continue

        # 给每个块加上标题上下文（如果有的话）
        prefix = f"[{heading}] " if heading else ""

        if len(prefix) + len(body) <= max_chars:
            chunks.append(prefix + body)
        else:
            # 按句子分割超长段落
            sentences = re.split(r'(?<=[。！？.!?\n])', body)
            current = prefix
            for sent in sentences:
                if not sent.strip():
                    continue
                if len(current) + len(sent) <= max_chars:
                    current += sent
                else:
                    if current.strip():
                        chunks.append(current.strip())
                    # 新块继承标题前缀 + 上一块尾部作为上下文
                    current = prefix + sent
            if current.strip():
                chunks.append(current.strip())

    # 添加上下文重叠
    if overlap_chars > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            tail = chunks[i - 1][-overlap_chars:]
            overlapped.append(tail + " " + chunks[i])
        chunks = overlapped

    return chunks


# --------------- 混合检索引擎（BM25 + TF-IDF + 重排） ---------------

def _tokenize(text: str) -> List[str]:
    """分词：支持中英文混合，按非字母数字字符拆分，转小写"""
    return re.findall(r'[\w\u4e00-\u9fff]+', text.lower())


def _compute_idf(documents: List[List[str]]) -> Dict[str, float]:
    """
    计算逆文档频率（IDF）。
    IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
    使用经典的 Robertson-Sparck Jones 公式。
    """
    n = len(documents)
    df: Dict[str, int] = defaultdict(int)
    for doc in documents:
        unique_terms = set(doc)
        for term in unique_terms:
            df[term] += 1

    idf: Dict[str, float] = {}
    for term, freq in df.items():
        idf[term] = math.log((n - freq + 0.5) / (freq + 0.5) + 1)
    return idf


def _bm25_score(
    query_tokens: List[str],
    doc_tokens: List[str],
    idf: Dict[str, float],
    avg_dl: float,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """
    计算单个文档的 BM25 得分。
    """
    doc_len = len(doc_tokens)
    doc_tf: Dict[str, int] = Counter(doc_tokens)
    score = 0.0

    for term in query_tokens:
        if term not in idf:
            continue
        tf = doc_tf.get(term, 0)
        if tf == 0:
            continue
        # BM25 公式
        numerator = tf * (k1 + 1)
        denominator = tf + k1 * (1 - b + b * doc_len / avg_dl)
        score += idf[term] * numerator / denominator

    return score


def _tfidf_score(
    query_vec: Counter,
    doc_vec: Counter,
    idf: Dict[str, float],
) -> float:
    """
    计算基于 IDF 权重的 TF-IDF 余弦相似度。
    """
    common = set(query_vec.keys()) & set(doc_vec.keys())
    if not common:
        return 0.0

    dot = sum(query_vec[k] * doc_vec[k] * idf.get(k, 1.0) for k in common)
    norm_a = math.sqrt(sum((v * idf.get(k, 1.0)) ** 2 for k, v in query_vec.items()))
    norm_b = math.sqrt(sum((v * idf.get(k, 1.0)) ** 2 for k, v in doc_vec.items()))

    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _rerank_score(
    query_tokens: Set[str],
    query_text: str,
    chunk_tokens: List[str],
    chunk_content: str,
    bm25: float,
    tfidf: float,
) -> float:
    """
    轻量级重排评分：综合多维信号。
    1. BM25 和 TF-IDF 的归一化加权组合
    2. 查询词覆盖率（recall of query terms）
    3. 精确短语匹配加分
    4. 词项密度加分
    """
    # 1. 基础分：BM25 权重 0.6 + TF-IDF 权重 0.4
    base = 0.6 * bm25 + 0.4 * tfidf

    # 2. 查询词覆盖率
    chunk_set = set(chunk_tokens)
    if query_tokens:
        coverage = len(query_tokens & chunk_set) / len(query_tokens)
    else:
        coverage = 0.0

    # 3. 精确短语匹配：查询原文出现在分块中
    query_lower = query_text.lower().strip()
    chunk_lower = chunk_content.lower()
    phrase_bonus = 0.15 if query_lower in chunk_lower else 0.0

    # 4. 词项密度：匹配词在分块中的占比
    if chunk_tokens:
        density = len(query_tokens & chunk_set) / len(chunk_tokens)
    else:
        density = 0.0

    # 综合得分
    score = base + 0.25 * coverage + phrase_bonus + 0.05 * min(density * 10, 1.0)
    return score


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
            query_token_set, query, chunk_tokens, chunk.content, bm25, tfidf,
        )
        scored.append((chunk, final_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


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
        logger.info("已加载向量模型: %s", model_name)
        return _vector_model
    except ImportError:
        logger.info("sentence-transformers 未安装，向量检索不可用（已降级为文本检索）")
        return None
    except Exception as e:
        logger.warning("加载向量模型失败: %s", e)
        return None


def vector_search(
    query: str,
    chunks: List[MaterialChunk],
    top_k: int = 5,
) -> List[Tuple[MaterialChunk, float]]:
    """
    可选的向量语义检索。
    如果 sentence-transformers 不可用，返回空列表（调用方应回退到混合检索）。
    """
    model = _get_vector_model()
    if model is None:
        return []

    try:
        query_embedding = model.encode(query, normalize_embeddings=True)
        chunk_texts = [c.content for c in chunks]
        chunk_embeddings = model.encode(chunk_texts, normalize_embeddings=True)

        # 计算余弦相似度（已归一化，点积即余弦）
        scores = []
        for i, emb in enumerate(chunk_embeddings):
            score = float(query_embedding @ emb)
            scores.append((chunks[i], score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]
    except Exception as e:
        logger.warning("向量检索失败: %s", e)
        return []


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
        _thinking, summary = await ai_service.chat_simple(
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


# --------------- 闪卡生成 ---------------

FLASHCARD_SYSTEM_PROMPT = """你是一位专业的学习助手。请根据以下学习资料内容，生成一组高质量的学习闪卡。

要求：
1. 提取核心知识点，每张闪卡正面是一个问题或概念，背面是对应的答案或解释
2. 生成 10-20 张闪卡，覆盖资料的主要内容
3. 问题要具体明确，答案要简洁准确
4. 用中文生成
5. 严格按以下 JSON 格式返回，不要包含其他内容：
[{{"front": "问题", "back": "答案"}}, {{"front": "问题", "back": "答案"}}]

---
资料内容：
{content}"""


async def generate_flashcards(content: str) -> List[dict]:
    """
    调用 AI 生成闪卡。
    返回 [{"front": "...", "back": "..."}, ...]
    """
    truncated = content[:15000] if len(content) > 15000 else content
    prompt = FLASHCARD_SYSTEM_PROMPT.format(content=truncated)
    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请为我生成学习闪卡。"}],
            system_prompt=prompt,
        )
        # 解析 JSON
        # 尝试提取 JSON 数组
        import re as _re
        match = _re.search(r'\[.*\]', result, _re.DOTALL)
        if match:
            cards = json.loads(match.group())
            # 验证格式
            valid = [c for c in cards if isinstance(c, dict) and "front" in c and "back" in c]
            return valid
        return []
    except Exception as e:
        logger.error("生成闪卡失败: %s", e)
        raise


# --------------- 测验生成 ---------------

QUIZ_SYSTEM_PROMPT = """你是一位专业的学习助手。请根据以下学习资料内容，生成一份测验卷。

要求：
1. 提取核心知识点，生成 5-10 道测验题。
2. 题目类型包括单选题（single）和判断题（boolean）。
3. 单选题必须提供 4 个选项。判断题的正确答案必须是 "正确" 或 "错误"。
4. 题目干和解析要具体明确。
5. 用中文生成。
6. 严格按以下 JSON 格式返回，不要包含其他内容：
[
  {{
    "question_type": "single",
    "question_text": "题干",
    "options": ["A选项内容", "B选项内容", "C选项内容", "D选项内容"],
    "correct_answer": "正确选项的文字内容，必须与options中的某一项完全一致",
    "explanation": "本题的详细解析"
  }},
  {{
    "question_type": "boolean",
    "question_text": "题干",
    "options": null,
    "correct_answer": "正确 或 错误",
    "explanation": "本题的详细解析"
  }}
]

---
资料内容：
{content}"""


async def generate_quiz(content: str) -> List[dict]:
    """
    调用 AI 生成测验试题。
    返回符合规格的题目列表。
    """
    truncated = content[:15000] if len(content) > 15000 else content
    prompt = QUIZ_SYSTEM_PROMPT.format(content=truncated)
    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请为我生成测验试卷。"}],
            system_prompt=prompt,
        )
        import re as _re
        match = _re.search(r'\[.*\]', result, _re.DOTALL)
        if match:
            questions = json.loads(match.group())
            valid = []
            for q in questions:
                if not isinstance(q, dict):
                    continue
                q_type = q.get("question_type")
                if q_type not in ("single", "boolean"):
                    continue
                # 单选题校验 options
                if q_type == "single":
                    opts = q.get("options")
                    if not isinstance(opts, list) or len(opts) != 4:
                        continue
                valid.append(q)
            return valid
        return []
    except Exception as e:
        logger.error("生成测验失败: %s", e)
        raise


# --------------- 知识导图与概念图谱生成 ---------------

MINDMAP_SYSTEM_PROMPT = """你是一位专业的学习助手。请根据以下学习资料内容，生成一份精炼的思维导图大纲结构。

要求：
1. 梳理出资料的核心框架、章节或核心主题。
2. 使用树状嵌套结构，支持最大 3 层深度。
3. 每个节点包含 "topic"（标题/节点词）和 "children"（子节点列表，如无子节点则为空数组）。
4. 用中文生成。
5. 严格按以下 JSON 格式返回，不要包含任何其他非 JSON 内容：
{{
  "topic": "中心主题/资料名称",
  "children": [
    {{
      "topic": "一级节点A",
      "children": [
        {{"topic": "二级节点A1", "children": []}},
        {{"topic": "二级节点A2", "children": []}}
      ]
    }},
    {{
      "topic": "一级节点B",
      "children": []
    }}
  ]
}}

---
资料内容：
{content}"""


CONCEPT_GRAPH_SYSTEM_PROMPT = """你是一位专业的学习助手。请分析以下学习资料，提取其中的核心知识实体（如概念、公式、定理、人物、事件等）以及它们之间的关联关系，生成一个知识关系图谱。

要求：
1. 提取 8-15 个核心节点，每个节点必须包含 "id"（拼音/英文唯一标识，不含空格）和 "label"（节点的中文名称）、"type"（实体类型，如 concept/formula/person/event 等）以及 "desc"（对该节点概念的简要解释）。
2. 提取节点之间的定向关系连线，每条连线包含 "source"（起点节点的 id）、"target"（终点节点的 id）以及 "label"（两者之间的关系，如 "定义为"、"应用于"、"包含"、"先导知识" 等）。
3. 连线的 source 和 target 必须是节点列表中存在且唯一的 id！
4. 严格按以下 JSON 格式返回，不要包含其他内容：
{{
  "nodes": [
    {{"id": "c1", "label": "概念A", "type": "concept", "desc": "释义"}},
    {{"id": "c2", "label": "定理B", "type": "formula", "desc": "释义"}}
  ],
  "edges": [
    {{"source": "c1", "target": "c2", "label": "推导出"}}
  ]
}}

---
资料内容：
{content}"""


async def generate_learning_map(content: str, map_type: str) -> dict:
    """
    调用 AI 生成思维导图或概念关系图谱。
    """
    truncated = content[:15000] if len(content) > 15000 else content

    if map_type == "mindmap":
        system_prompt = MINDMAP_SYSTEM_PROMPT.format(content=truncated)
        prompt_text = "请为我生成思维导图结构。"
    else:
        system_prompt = CONCEPT_GRAPH_SYSTEM_PROMPT.format(content=truncated)
        prompt_text = "请为我生成概念关系图谱结构。"

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": prompt_text}],
            system_prompt=system_prompt,
        )

        # 提取第一个合法的 JSON 对象
        import re as _re
        match = _re.search(r'\{.*\}', result, _re.DOTALL)
        if match:
            map_dict = json.loads(match.group())

            # 进行基础结构校验
            if map_type == "mindmap":
                if "topic" in map_dict and isinstance(map_dict.get("children"), list):
                    return map_dict
            else:
                if isinstance(map_dict.get("nodes"), list) and isinstance(map_dict.get("edges"), list):
                    return map_dict
            return {}
        return {}
    except Exception as e:
        logger.error("生成学习导图/图谱失败: %s", e)
        raise


EVALUATION_SYSTEM_PROMPT = """你是一位资深的AI学习规划专家。请根据用户的学习数据，为这份学习资料的学习情况进行多维度评估，并给出针对性的个性化诊断报告。

学习资料核心内容/摘要：
{material_summary}

用户学习数据：
- 测验平均正确率：{quiz_accuracy}%
- 错题记录：
{wrong_questions_summary}
- 闪卡记忆盒分布：{flashcard_progress}

请以精炼、鼓励性的水墨风散文体语言，生成一份多维度评估报告。
报告必须包含以下三个部分，并使用 Markdown 格式输出：
1. **学情概况**：用简练的语言概括用户的学习进度与当前状态。
2. **薄弱点与根因诊断**：结合错题记录，深入分析用户在哪些具体知识点上存在混淆、理解偏差或记忆盲区。
3. **自适应复习建议**：针对薄弱点，给出具体的复习策略、行动指南以及下一阶段的学习重心建议。

字数要求在 300-500 字之间，用中文撰写。直接输出 Markdown 内容，不要包含任何旁白。
"""

ADAPTIVE_QUIZ_SYSTEM_PROMPT = """你是一位资深的教育评估专家。请根据用户之前的错题记录和以下学习资料，针对性地生成一套包含 5 道题目的强化训练测验（包含单选题和判断题）。

学习资料内容：
{content}

用户的历史错题记录：
{wrong_questions_context}

要求：
1. 深入分析用户做错的题目及其背后的知识点，设计 5 道全新的、难度适中的强化题目（例如 3 道单选题，2 道判断题），用于针对性查漏补缺。
2. 题目内容必须与错题高度相关（如测试相同概念、关联概念或对比概念），但不能直接使用原题。
3. 严格遵循以下 JSON 格式输出，不要包含任何 Markdown 标记或非 JSON 旁白：
[
  {{
    "question_type": "single",
    "question_text": "题干内容...",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correct_answer": "选项A",
    "explanation": "详细的答案解析..."
  }},
  {{
    "question_type": "boolean",
    "question_text": "判断题干内容...",
    "correct_answer": "正确",
    "explanation": "详细的答案解析..."
  }}
]
"""

async def generate_evaluation_report(
    material_summary: str,
    quiz_accuracy: float,
    wrong_questions: List[any],  # noqa: F821
    flashcard_progress: str,
) -> str:
    """生成AI学习诊断评估报告"""
    if wrong_questions:
        wrong_summary = "\n".join([
            f"- 题目：{q.question_text}\n  用户回答：{q.user_answer or '未作答'}\n  正确答案：{q.correct_answer}\n  解析：{q.explanation or '无'}"
            for q in wrong_questions[:10]
        ])
    else:
        wrong_summary = "暂无错题记录"

    system_prompt = EVALUATION_SYSTEM_PROMPT.format(
        material_summary=material_summary[:3000],
        quiz_accuracy=round(quiz_accuracy, 1),
        wrong_questions_summary=wrong_summary,
        flashcard_progress=flashcard_progress,
    )

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请为我生成学习诊断与评估报告。"}],
            system_prompt=system_prompt,
        )
        return result.strip()
    except Exception as e:
        logger.error("生成学习评估报告失败: %s", e)
        return "评估报告生成失败，请重试。"

async def generate_adaptive_quiz(
    content: str,
    wrong_questions: List[any],  # noqa: F821
) -> List[dict]:  # noqa: UP035
    """生成自适应错题强化训练测验题"""
    truncated = content[:12000] if len(content) > 12000 else content
    if wrong_questions:
        wrong_context = "\n".join([
            f"- 题目：{q.question_text}\n  正确答案：{q.correct_answer}\n  解析：{q.explanation or '无'}"
            for q in wrong_questions[:8]
        ])
    else:
        wrong_context = "暂无具体错题记录，请围绕资料核心知识点生成基础题目。"

    prompt = ADAPTIVE_QUIZ_SYSTEM_PROMPT.format(
        content=truncated,
        wrong_questions_context=wrong_context,
    )

    try:
        _thinking, result = await ai_service.chat_simple(
            messages=[{"role": "user", "content": "请为我生成自适应强化测验试卷。"}],
            system_prompt=prompt,
        )
        import re as _re
        match = _re.search(r'\[.*\]', result, _re.DOTALL)
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
