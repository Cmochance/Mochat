"""
知识库 API 路由 - 处理文档上传与知识库管理
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..core.dependencies import get_current_active_user
from ..db.models import User
from ..services.knowledge_service import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


@router.post("/upload")
async def upload_document(file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)):
    """
    上传文档到个人知识库
    支持: .txt, .md, .pdf, .docx
    """
    # 检查文件类型
    allowed_extensions = {".txt", ".md", ".pdf", ".docx"}
    file_ext = "." + file.filename.split(".")[-1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式，仅支持: {', '.join(allowed_extensions)}")

    # 读取文件内容
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
