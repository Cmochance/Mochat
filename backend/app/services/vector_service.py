"""
向量数据库服务
封装 ChromaDB 的初始化、文档向量化入库与语义检索功能
"""

import logging
from typing import Any, Dict, List

import chromadb
from chromadb.utils import embedding_functions

from ..core.config import settings

logger = logging.getLogger(__name__)


class VectorService:
    def __init__(self):
        self._client = chromadb.PersistentClient(path="./chroma_db")
        # 使用 OpenAI Embedding，也可根据需求替换为本地模型如 bge-large-zh
        self._ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=settings.AI_API_KEY, api_base=settings.AI_BASE_URL, model_name="text-embedding-3-small"
        )
        logger.info("ChromaDB 向量数据库服务初始化完成")

    def get_or_create_collection(self, collection_name: str):
        """获取或创建一个向量集合（Collection）"""
        return self._client.get_or_create_collection(
            name=collection_name, embedding_function=self._ef, metadata={"hnsw:space": "cosine"}
        )

    async def add_documents(
        self, collection_name: str, documents: List[str], metadatas: List[Dict[str, Any]], ids: List[str]
    ):
        """将文本切片、元数据和ID入库，并自动进行向量化"""
        try:
            collection = self.get_or_create_collection(collection_name)
            collection.add(documents=documents, metadatas=metadatas, ids=ids)
            logger.info(f"向量集合 [{collection_name}] 成功入库 {len(documents)} 条文档")
        except Exception as e:
            logger.error(f"向量化入库失败: {e}")
            raise

    async def search(self, collection_name: str, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """在指定集合中执行语义检索"""
        try:
            collection = self.get_or_create_collection(collection_name)
            if collection.count() == 0:
                return []

            results = collection.query(query_texts=[query_text], n_results=top_k)

            formatted_results = []
            if results and results["documents"]:
                for i, doc in enumerate(results["documents"][0]):
                    formatted_results.append(
                        {
                            "text": doc,
                            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                            "distance": results["distances"][0][i] if results["distances"] else 0,
                        }
                    )
            return formatted_results
        except Exception as e:
            logger.error(f"向量检索失败: {e}")
            return []

    async def delete_collection(self, collection_name: str):
        """删除一个向量集合"""
        try:
            self._client.delete_collection(collection_name)
            logger.info(f"向量集合 [{collection_name}] 已被删除")
        except Exception as e:
            logger.warning(f"删除向量集合失败: {e}")


# 实例化全局向量服务
vector_service = VectorService()
