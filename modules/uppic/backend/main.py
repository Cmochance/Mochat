"""
Uppic - 独立图片上传微服务
提供 R2 预签名 URL 生成服务，支持客户端直传
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid

from config import settings
from storage import storage_service

app = FastAPI(
    title="Uppic - 图片上传服务",
    description="独立的图片上传微服务，基于 Cloudflare R2",
    version="1.0.0"
)

# CORS 配置 - 允许主项目访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PresignRequest(BaseModel):
    """预签名 URL 请求"""
    filename: str
    contentType: str
    folder: Optional[str] = "images"
    userId: Optional[str] = "anonymous"


class PresignResponse(BaseModel):
    """预签名 URL 响应"""
    uploadUrl: str
    key: str
    publicUrl: str


# 允许的图片类型
ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']


@app.get("/")
async def root():
    """服务状态"""
    return {
        "service": "uppic",
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
    
    客户端使用此 URL 直接上传文件到 R2，无需经过后端服务器
    """
    # 验证文件类型
    if request.contentType not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {request.contentType}，仅支持 JPEG, PNG, GIF, WebP"
        )
    
    # 生成唯一的存储 key
    file_ext = request.filename.split('.')[-1] if '.' in request.filename else 'jpg'
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
