"""
账号管理服务 - 处理用户认证相关业务逻辑
"""
from typing import Optional
from datetime import timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import User
from ..core.security import create_access_token, verify_password
from ..core.config import settings


class AuthService:
    """账号管理服务类"""
    
    @staticmethod
    async def register(
        db: AsyncSession,
        username: str,
        email: str,
        password: str
    ) -> tuple[Optional[User], Optional[str]]:
        """
        用户注册
        返回: (user, error_message)
        """
        # 检查用户名是否已存在
        if await crud.get_user_by_username(db, username):
            return None, "用户名已被使用"
        
        # 检查邮箱是否已存在
        if await crud.get_user_by_email(db, email):
            return None, "邮箱已被注册"
        
        # 创建用户
        user = await crud.create_user(db, username, email, password)
        return user, None
    
    @staticmethod
    async def login(
        db: AsyncSession,
        username: str,
        password: str
    ) -> tuple[Optional[str], Optional[User], Optional[str]]:
        """
        用户登录
        返回: (token, user, error_message)
        """
        # 验证用户
        user = await crud.authenticate_user(db, username, password)
        if not user:
            return None, None, "用户名或密码错误"
        
        if not user.is_active:
            return None, None, "账号已被禁用"
        
        # 生成令牌
        access_token = create_access_token(
            data={"sub": str(user.id), "username": user.username, "role": user.role},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return access_token, user, None
    
    @staticmethod
    async def change_password(
        db: AsyncSession,
        user: User,
        old_password: str,
        new_password: str
    ) -> tuple[bool, Optional[str]]:
        """
        修改密码
        返回: (success, error_message)
        """
        # 验证旧密码
        if not verify_password(old_password, user.password_hash):
            return False, "原密码错误"
        
        # 更新密码
        from ..core.security import get_password_hash
        await crud.update_user(db, user.id, password_hash=get_password_hash(new_password))
        
        return True, None
    
    @staticmethod
    async def create_default_users(db: AsyncSession) -> None:
        """
        创建默认账号（管理员和普通用户）
        """
        # 创建管理员账号
        admin = await crud.get_user_by_username(db, "mochance")
        if not admin:
            await crud.create_user(
                db,
                username="mochance",
                email="mochance@mochat.com",
                password="mochance1104",
                role="admin"
            )
        
        # 创建普通用户账号
        user = await crud.get_user_by_username(db, "ch337338")
        if not user:
            await crud.create_user(
                db,
                username="ch337338",
                email="ch337338@mochat.com",
                password="ch337338",
                role="user"
            )
    
    @staticmethod
    def validate_password(password: str) -> tuple[bool, str]:
        """
        验证密码格式
        规则：仅支持数字/小写字母/大写字母且至少有两种
        返回: (is_valid, error_message)
        """
        import re
        
        # 检查是否只包含数字、小写字母、大写字母
        if not re.match(r'^[a-zA-Z0-9]+$', password):
            return False, "失败，密码不支持特殊符号！"
        
        # 检查是否至少包含两种字符类型
        has_lower = bool(re.search(r'[a-z]', password))
        has_upper = bool(re.search(r'[A-Z]', password))
        has_digit = bool(re.search(r'[0-9]', password))
        
        type_count = sum([has_lower, has_upper, has_digit])
        if type_count < 2:
            return False, "密码必须至少包含数字、小写字母、大写字母中的两种"
        
        return True, ""
