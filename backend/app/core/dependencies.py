"""
依赖注入模块 - FastAPI依赖项
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from .security import decode_access_token
from .config import settings
from ..db.database import get_db
from ..db import crud
from ..db.models import User
from ..services.supabase_auth_service import supabase_auth_service

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """获取当前登录用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = credentials.credentials
    auth_provider = settings.AUTH_PROVIDER.lower().strip()

    if auth_provider == "supabase":
        supa_user, error = await supabase_auth_service.get_user(token)
        if error or not supa_user:
            raise credentials_exception

        supabase_auth_id = supa_user.get("id")
        if not supabase_auth_id:
            raise credentials_exception

        user = await crud.get_user_by_supabase_auth_id(db, supabase_auth_id)
        if user is None:
            # 兼容迁移过渡期：按邮箱回填映射
            email = str(supa_user.get("email") or "").strip().lower()
            if email:
                existing = await crud.get_user_by_email(db, email)
                if existing:
                    user = await crud.update_user(db, existing.id, supabase_auth_id=supabase_auth_id)

        if user is None:
            raise credentials_exception
        return user

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    user = await crud.get_user_by_id(db, user_id)
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """获取当前活跃用户"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")
    return current_user


async def get_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """获取管理员用户"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user
