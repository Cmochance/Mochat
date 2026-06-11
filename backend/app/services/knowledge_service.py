"""
知识库服务 - 处理RAG（检索增强生成）流程
包括：文档上传解析、文本切片、Embedding向量化、内存向量检索
"""
import logging
import math
import re
from typing import List, Dict, Any, Optional, Tuple
from io import BytesIO
from pypdf import PdfReader
from docx import Document
from ..core.config import settings
from openai import OpenAI

logger = logging.getLogger(__name__)

# 定义文本切片大小（字符数）与重叠区间
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

class KnowledgeService:
    def __init__(self):
        # 这里的 vector_stores 存储每个用户上传文档的向量数据
        # 结构: Dict[user_id, List[Dict[text: str, embedding: List[float]]]]
        self.vector_stores: Dict[int, List[Dict[str, Any]]] = {}
        self.embedding_client = OpenAI(
            api_key=settings.AI_API_KEY,
            base_url=settings.AI_BASE_URL
        )

    def _parse_document(self, file_name: str, content: bytes) -> str:
        """解析文件内容为纯文本"""
        if file_name.endswith('.pdf'):
            reader = PdfReader(BytesIO(content))
            return "\n".join([page.extract_text() or "" for page in reader.pages])
        elif file_name.endswith('.docx'):
            doc = Document(BytesIO(content))
            return "\n".join([para.text for para in doc.paragraphs])
        elif file_name.endswith('.txt') or file_name.endswith('.md'):
            return content.decode('utf-8')
        else:
            raise ValueError(f"不支持的文件格式: {file_name}")

    def _split_text(self, text: str) -> List[str]:
        """将长文本按固定大小切片，支持重叠"""
        # 清理多余空白，保持逻辑段落
        text = re.sub(r'\n+', '\n', text).strip()
        if len(text) <= CHUNK_SIZE:
            return [text]
        
        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            chunks.append(text[start:end])
            start += CHUNK_SIZE - CHUNK_OVERLAP
        return chunks

    def _get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """调用 Embedding 模型获取文本向量"""
        try:
            # 注意：这里默认复用 AI_BASE_URL 和 AI_API_KEY，通常 Embedding 和 Chat 是同域的
            # 如果需要特定的 Embedding 模型，可扩展 settings
            response = self.embedding_client.embeddings.create(
                input=texts,
                model="text-embedding-ada-002" # 可配置化
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"Embedding 生成失败: {e}")
            # 降级处理：如果 Embedding 失败，返回全零向量（会导致检索不准，但保证系统不崩）
            return [[0.0] * 1536 for _ in texts]

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """计算两个向量的余弦相似度"""
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot_product / (norm_a * norm_b)

    async def add_document(self, user_id: int, file_name: str, file_content: bytes) -> int:
        """
        处理用户上传的文档：解析、切片、向量化并存入该用户的内存知识库
        返回切片数量
        """
        text = self._parse_document(file_name, file_content)
        chunks = self._split_text(text)
        
        if not chunks:
            return 0
            
        embeddings = self._get_embeddings(chunks)
        
        new_docs = []
        for chunk, embedding in zip(chunks, embeddings):
            new_docs.append({"text": chunk, "embedding": embedding})
            
        if user_id not in self.vector_stores:
            self.vector_stores[user_id] = []
            
        self.vector_stores[user_id].extend(new_docs)
        logger.info(f"用户 {user_id} 新增文档 {file_name}，切片数：{len(chunks)}")
        return len(chunks)

    async def search_knowledge(self, user_id: int, query: str, top_k: int = 3) -> List[str]:
        """
        根据用户的问题，在其私有知识库中检索最相关的文本切片
        """
        user_docs = self.vector_stores.get(user_id, [])
        if not user_docs:
            return []

        query_embedding = self._get_embeddings([query])[0]
        
        # 计算相似度并排序
        scored_docs = []
        for doc in user_docs:
            score = self._cosine_similarity(query_embedding, doc["embedding"])
            scored_docs.append((score, doc["text"]))
            
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [text for score, text in scored_docs[:top_k] if score > 0.2] # 设定一个相似度阈值

# 实例化全局知识库服务
knowledge_service = KnowledgeService()

