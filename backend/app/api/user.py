"""
用户API路由 - 处理用户个人信息
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db import crud
from ..schemas.user import UserResponse, UserUpdate
from ..core.dependencies import get_current_active_user
from ..db.models import User

router = APIRouter()


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
