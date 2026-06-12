"""
知识库 API 路由 - 处理文档上传、管理与知识图谱生成
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..core.dependencies import get_current_active_user
from ..db.models import User
from ..services.knowledge_service import knowledge_service
from ..services.vector_service import vector_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


@router.post("/upload")
async def upload_document(file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)):
    """
    上传文档到个人知识库
    支持: .txt, .md, .pdf, .docx
    """
    allowed_extensions = {".txt", ".md", ".pdf", ".docx"}
    file_ext = "." + file.filename.split(".")[-1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式，仅支持: {', '.join(allowed_extensions)}")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 限制 10MB
        raise HTTPException(status_code=400, detail="文件大小不能超过 10MB")

    try:
        chunk_count = await knowledge_service.add_document(
            user_id=current_user.id, file_name=file.filename, file_content=content
        )
        return {"message": "文档上传并解析成功", "chunk_count": chunk_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文档处理失败: {str(e)}")


@router.get("/graph")
async def get_knowledge_graph(current_user: User = Depends(get_current_active_user)):
    """
    生成当前用户私有知识库的知识图谱
    前端可用于 Echarts, D3.js, 或 React-Force-Graph 渲染
    """
    try:
        collection_name = f"user_{current_user.id}_docs"

        # 获取用户的知识库源数据 (此处获取前 50 条切片作为图谱生成的源数据)
        results = await vector_service.search(collection_name=collection_name, query_text="overview all", top_k=50)
        texts = [res["text"] for res in results]

        if not texts:
            return {"nodes": [], "links": []}

        # 调用 AI 进行知识实体与关系抽取
        graph_data = await knowledge_service.extract_graph_data(texts)
        return graph_data
    except Exception as e:
        logger.error(f"生成知识图谱失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成知识图谱失败: {str(e)}")
