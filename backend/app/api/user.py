"""
用户API路由 - 处理用户个人信息
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional

from ..db.database import get_db
from ..db import crud
from ..schemas.user import UserResponse, UserUpdate
from ..core.dependencies import get_current_active_user
from ..db.models import User

router = APIRouter()

# ============ 版本信息 ============

CURRENT_VERSION = "v1.3"

VERSION_HISTORY = [
    {
        "version": "v1.0",
        "description": "搭建网站框架，成功部署并投入使用。"
    },
    {
        "version": "v1.1",
        "description": "添加上传图片功能。"
    },
    {
        "version": "v1.2",
        "description": "风控设置，设置系统提示词掐断和后台添加遗漏违禁词功能。"
    },
    {
        "version": "v1.3",
        "description": "优化公式输出格式问题，添加上传word文档功能。"
    },
]


class VersionInfo(BaseModel):
    """版本信息响应"""
    current_version: str
    last_seen_version: Optional[str]
    has_new_version: bool
    version_history: List[dict]


class VersionAckRequest(BaseModel):
    """版本确认请求"""
    version: str


@router.get("/profile", response_model=UserResponse)
async def get_profile(
    current_user: User = Depends(get_current_active_user)
):
    """获取用户个人资料"""
    return current_user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户个人资料"""
    # 只允许更新用户名和邮箱
    update_dict = {}
    if update_data.username:
        # 检查用户名是否已被使用
        existing = await crud.get_user_by_username(db, update_data.username)
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已被使用"
            )
        update_dict["username"] = update_data.username
    
    if update_data.email:
        # 检查邮箱是否已被使用
        existing = await crud.get_user_by_email(db, update_data.email)
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已被使用"
            )
        update_dict["email"] = update_data.email
    
    if update_dict:
        user = await crud.update_user(db, current_user.id, **update_dict)
        return user
    
    return current_user


# ============ 版本 API ============

@router.get("/version", response_model=VersionInfo)
async def get_version_info(
    current_user: User = Depends(get_current_active_user)
):
    """获取版本信息"""
    last_seen = current_user.last_seen_version
    has_new = last_seen != CURRENT_VERSION
    
    return VersionInfo(
        current_version=CURRENT_VERSION,
        last_seen_version=last_seen,
        has_new_version=has_new,
        version_history=VERSION_HISTORY
    )


@router.post("/version/ack")
async def acknowledge_version(
    request: VersionAckRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """确认已阅读版本更新"""
    await crud.update_user(db, current_user.id, last_seen_version=request.version)
    return {"success": True, "message": "版本已确认"}
