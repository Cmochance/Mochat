"""
Upgrade - 独立版本更新通知微服务
提供版本信息查询和已读状态管理
"""
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import httpx

from config import settings
from version_data import CURRENT_VERSION, VERSION_HISTORY

app = FastAPI(
    title="Upgrade - 版本更新通知服务",
    description="独立的版本更新通知微服务",
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

# 主后端服务地址（用于获取和更新用户信息）
MAIN_BACKEND_URL = "http://backend:9527"


# ============ 请求/响应模型 ============

class VersionHistoryItem(BaseModel):
    """版本历史条目"""
    version: str
    description: str


class VersionInfoResponse(BaseModel):
    """版本信息响应"""
    current_version: str
    last_seen_version: Optional[str]
    has_new_version: bool
    version_history: List[VersionHistoryItem]


class VersionAckRequest(BaseModel):
    """版本确认请求"""
    version: str


# ============ API 端点 ============

@app.get("/")
async def root():
    """服务状态"""
    return {
        "service": "upgrade",
        "status": "running",
        "version": "1.0.0",
        "current_app_version": CURRENT_VERSION
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}


@app.get("/api/version", response_model=VersionInfoResponse)
async def get_version_info(authorization: str = Header(None)):
    """
    获取版本信息
    需要传递 Authorization header 以验证用户身份
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 从主后端获取用户信息
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{MAIN_BACKEND_URL}/api/user/profile",
                headers={"Authorization": authorization}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="用户验证失败")
            
            user_data = response.json()
            last_seen = user_data.get("last_seen_version")
    except httpx.RequestError as e:
        print(f"[Upgrade] 获取用户信息失败: {e}")
        # 如果无法连接主后端，假设用户未看过任何版本
        last_seen = None
    
    has_new = last_seen != CURRENT_VERSION
    
    return VersionInfoResponse(
        current_version=CURRENT_VERSION,
        last_seen_version=last_seen,
        has_new_version=has_new,
        version_history=[VersionHistoryItem(**v) for v in VERSION_HISTORY]
    )


@app.post("/api/version/ack")
async def acknowledge_version(
    request: VersionAckRequest,
    authorization: str = Header(None)
):
    """
    确认已阅读版本更新
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="未授权")
    
    try:
        # 调用主后端更新用户的 last_seen_version
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{MAIN_BACKEND_URL}/api/user/version/ack",
                headers={
                    "Authorization": authorization,
                    "Content-Type": "application/json"
                },
                json={"version": request.version}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="更新版本状态失败"
                )
            
            return {"success": True, "message": "版本已确认"}
    except httpx.RequestError as e:
        print(f"[Upgrade] 更新版本状态失败: {e}")
        raise HTTPException(status_code=500, detail="服务暂时不可用")


@app.get("/api/version/current")
async def get_current_version():
    """
    获取当前版本号（无需认证）
    可用于在侧边栏等位置显示版本号
    """
    return {"version": CURRENT_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
