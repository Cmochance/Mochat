"""
Upword - 独立 Word 文档上传解析微服务
提供文档上传预签名 URL 生成和文档解析服务
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid

from config import settings
from storage import storage_service
from parser import doc_parser

app = FastAPI(
    title="Upword - 文档上传解析服务",
    description="独立的 Word 文档上传解析微服务，基于 Cloudflare R2",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ 请求/响应模型 ============

class PresignRequest(BaseModel):
    """预签名 URL 请求"""
    filename: str
    contentType: str
    folder: Optional[str] = "documents"
    userId: Optional[str] = "anonymous"


class PresignResponse(BaseModel):
    """预签名 URL 响应"""
    uploadUrl: str
    key: str
    publicUrl: str


class ParseRequest(BaseModel):
    """文档解析请求"""
    objectKey: str


class ParseResponse(BaseModel):
    """文档解析响应"""
    success: bool
    markdown: Optional[str] = None
    error: Optional[str] = None


# 允许的文档类型
ALLOWED_TYPES = [
    'application/msword',  # .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
]


# ============ API 端点 ============

@app.get("/")
async def root():
    """服务状态"""
    return {
        "service": "upword",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}


@app.post("/api/upload/sign", response_model=PresignResponse)
async def get_presigned_url(request: PresignRequest):
    """
    获取预签名上传 URL
    
    客户端使用此 URL 直接上传文件到 R2
    """
    # 验证文件类型
    if request.contentType not in ALLOWED_TYPES:
        # 也支持通过文件扩展名判断
        lower_name = request.filename.lower()
        if not (lower_name.endswith('.doc') or lower_name.endswith('.docx')):
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型，仅支持 .doc 和 .docx"
            )
    
    # 生成唯一的存储 key
    unique_id = str(uuid.uuid4())[:8]
    key = f"{request.folder}/{request.userId}/{unique_id}_{request.filename}"
    
    try:
        result = storage_service.generate_presigned_url(
            key=key,
            content_type=request.contentType,
            expires_in=3600
        )
        return PresignResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/parse", response_model=ParseResponse)
async def parse_document(request: ParseRequest):
    """
    解析已上传的文档
    
    从 R2 下载文档并转换为 Markdown
    """
    try:
        # 1. 从 R2 下载文件到内存
        file_stream = storage_service.download_to_memory(request.objectKey)
        
        # 获取文件名
        filename = request.objectKey.split('/')[-1]
        
        # 2. 解析文档
        success, result = doc_parser.parse(file_stream, filename)
        
        if success:
            return ParseResponse(success=True, markdown=result)
        else:
            return ParseResponse(success=False, error=result)
            
    except Exception as e:
        return ParseResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
