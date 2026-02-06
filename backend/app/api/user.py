"""
用户API路由 - 处理用户个人信息
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..db.database import get_db
from ..db import crud
from ..schemas.user import UserResponse, UserUpdate, UserUsageResponse
from ..core.dependencies import get_current_active_user
from ..services.usage_service import usage_service
from ..db.models import User

router = APIRouter()


class VersionAckRequest(BaseModel):
    """版本确认请求 - 供 upgrade 模块调用"""
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


# ============ 版本 API（供 upgrade 模块调用）============

@router.post("/version/ack")
async def acknowledge_version(
    request: VersionAckRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    确认已阅读版本更新
    此 API 供 upgrade 模块调用，用于更新用户的 last_seen_version
    """
    await crud.update_user(db, current_user.id, last_seen_version=request.version)
    return {"success": True, "message": "版本已确认"}


# ============ 使用量 API ============

@router.get("/usage", response_model=UserUsageResponse)
async def get_usage(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的使用量信息
    包括等级、今日对话/生图使用量和剩余量
    """
    usage_info = await usage_service.get_user_usage_info(db, current_user)
    return usage_info


@router.get("/usage/check-chat")
async def check_chat_limit(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查用户是否可以发送对话请求
    前端在发送消息前调用此接口检查
    """
    can_send, error_msg = await usage_service.check_chat_limit(db, current_user)
    return {
        "allowed": can_send,
        "message": error_msg if not can_send else ""
    }


@router.get("/usage/check-image")
async def check_image_limit(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查用户是否可以发送生图请求
    前端在调用绘图服务前调用此接口检查
    """
    can_send, error_msg = await usage_service.check_image_limit(db, current_user)
    return {
        "allowed": can_send,
        "message": error_msg if not can_send else ""
    }


@router.post("/usage/increment-image")
async def increment_image_usage(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    增加用户的生图使用计数
    前端在成功生成图片后调用此接口
    """
    await usage_service.increment_image_count(db, current_user)
    await db.commit()
    return {"success": True}
