"""
知识库服务 - 处理RAG（检索增强生成）流程
包括：文档上传解析、文本切片、向量化存储、混合检索、知识图谱构建
"""

import logging
import re
import uuid
from io import BytesIO
from typing import Any, Dict, List

from docx import Document
from openai import OpenAI
from pypdf import PdfReader

from ..core.config import settings
from .ai_service import ai_service
from .vector_service import vector_service

logger = logging.getLogger(__name__)

# 定义文本切片大小（字符数）与重叠区间
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

GRAPH_EXTRACTION_SYSTEM_PROMPT = """\
你是墨语（Mochat）的知识图谱构建专家。
请根据以下提供的文本切片，抽取出核心的实体（概念、人物、组织、技术术语等）以及它们之间的关系。
要求：
1. 仅基于提供的文本内容进行抽取，不要臆造不存在的关系。
2. 返回标准的 JSON 格式，结构如下：
{
  "nodes": [
    {"id": "唯一的实体名", "name": "实体名", "category": "类别(如：人物/技术/概念)", "val": 1}
  ],
  "links": [
    {"source": "源实体名", "target": "目标实体名", "relation": "两者之间的关系描述"}
  ]
}
3. 实体名称必须严格保持一致。
4. 节点数量限制在 20 个以内，关系限制在 30 个以内，选取最核心的内容。
"""


class KnowledgeService:
    def __init__(self):
        self.embedding_client = OpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)

    def _parse_document(self, file_name: str, content: bytes) -> str:
        """解析文件内容为纯文本"""
        if file_name.endswith(".pdf"):
            reader = PdfReader(BytesIO(content))
            return "\n".join([page.extract_text() or "" for page in reader.pages])
        elif file_name.endswith(".docx"):
            doc = Document(BytesIO(content))
            return "\n".join([para.text for para in doc.paragraphs])
        elif file_name.endswith(".txt") or file_name.endswith(".md"):
            return content.decode("utf-8", errors="ignore")
        return ""

    def _split_text(self, text: str) -> List[str]:
        """将文本切片为带有重叠区间的 Chunk"""
        if not text:
            return []

        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            chunks.append(text[start:end])
            start += CHUNK_SIZE - CHUNK_OVERLAP
        return chunks

    async def add_document(self, user_id: int, file_name: str, file_content: bytes) -> int:
        """
        处理用户上传的文档：解析、切片、向量化并存入 ChromaDB 向量知识库
        返回切片数量
        """
        text = self._parse_document(file_name, file_content)
        chunks = self._split_text(text)

        if not chunks:
            return 0

        collection_name = f"user_{user_id}_docs"
        doc_ids = [str(uuid.uuid4()) for _ in chunks]
        metadatas = [{"file_name": file_name, "user_id": str(user_id)} for _ in chunks]

        await vector_service.add_documents(
            collection_name=collection_name, documents=chunks, metadatas=metadatas, ids=doc_ids
        )
        logger.info(f"用户 {user_id} 新增文档 {file_name}，切片数：{len(chunks)}")
        return len(chunks)

    async def search_knowledge(self, user_id: int, query: str, top_k: int = 3) -> List[str]:
        """
        根据用户的问题，在其私有知识库中通过向量检索最相关的文本切片
        """
        collection_name = f"user_{user_id}_docs"
        results = await vector_service.search(collection_name=collection_name, query_text=query, top_k=top_k)
        return [res["text"] for res in results]

    async def extract_graph_data(self, texts: List[str]) -> Dict[str, Any]:
        """
        从文本切片中抽取知识图谱数据（节点和连接）
        """
        # 将多段文本合并，并限制最大长度以免超出 Token 限制
        context = "\n".join(texts)
        if len(context) > 3000:
            context = context[:3000]

        user_prompt = f"以下是待抽取知识图谱的文本内容：\n\n{context}"

        try:
            _thinking, result = await ai_service.chat_simple(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=GRAPH_EXTRACTION_SYSTEM_PROMPT,
            )

            # 提取 JSON 部分
            import json

            match = re.search(r"\{.*\}", result, re.DOTALL)
            if match:
                return json.loads(match.group())
            return {"nodes": [], "links": []}
        except Exception as e:
            logger.error(f"生成知识图谱失败: {e}")
            return {"nodes": [], "links": []}


# 实例化全局知识库服务
knowledge_service = KnowledgeService()
