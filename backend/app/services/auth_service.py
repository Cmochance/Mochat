"""
账号管理服务 - 处理用户认证相关业务逻辑
"""
from typing import Any, Dict, Optional
from datetime import timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import User
from ..core.security import create_access_token, verify_password, get_password_hash, encrypt_password
from ..core.config import settings
from .supabase_auth_service import supabase_auth_service


class AuthService:
    """账号管理服务类"""

    @staticmethod
    def _use_supabase_auth() -> bool:
        return settings.AUTH_PROVIDER.lower().strip() == "supabase"

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
        normalized_email = email.strip().lower()

        # 检查用户名是否已存在
        if await crud.get_user_by_username(db, username):
            return None, "用户名已被使用"

        # 检查邮箱是否已存在
        if await crud.get_user_by_email(db, normalized_email):
            return None, "邮箱已被注册"

        # Supabase Auth 模式：先创建 Supabase 用户，再落本地档案
        if AuthService._use_supabase_auth():
            supa_user, error = await supabase_auth_service.admin_create_user(
                email=normalized_email,
                password=password,
                email_confirm=True,
                user_metadata={"username": username},
            )
            if error:
                return None, error

            supabase_auth_id = (supa_user or {}).get("id")
            if not supabase_auth_id:
                return None, "创建 Supabase 用户失败：未返回用户 ID"

            user = await crud.create_user(
                db,
                username=username,
                email=normalized_email,
                password=password,
                supabase_auth_id=supabase_auth_id,
            )
            return user, None

        # Legacy 模式：本地创建用户
        user = await crud.create_user(db, username, normalized_email, password)
        return user, None

    @staticmethod
    async def login(
        db: AsyncSession,
        identifier: str,
        password: str
    ) -> tuple[Optional[Dict[str, Any]], Optional[User], Optional[str]]:
        """
        用户登录
        返回: (auth_payload, user, error_message)
        """
        normalized_identifier = (identifier or "").strip()
        if not normalized_identifier:
            return None, None, "用户名或邮箱不能为空"

        if AuthService._use_supabase_auth():
            known_user: Optional[User] = None
            if "@" in normalized_identifier:
                login_email = normalized_identifier.lower()
            else:
                known_user = await crud.get_user_by_username(db, normalized_identifier)
                if not known_user:
                    return None, None, "用户名或密码错误"
                login_email = known_user.email.lower()

            token_data, error = await supabase_auth_service.password_login(login_email, password)
            if error:
                return None, None, "用户名或密码错误"

            supabase_user = (token_data or {}).get("user") or {}
            supabase_auth_id = supabase_user.get("id")
            if not supabase_auth_id:
                return None, None, "登录失败：未获取到用户身份"

            user = await crud.get_user_by_supabase_auth_id(db, supabase_auth_id)
            if not user:
                # 兼容迁移过渡期：按邮箱回填 supabase_auth_id
                user = known_user or await crud.get_user_by_email(db, login_email)
                if user:
                    user = await crud.update_user(db, user.id, supabase_auth_id=supabase_auth_id)

            if not user:
                return None, None, "账号未初始化，请联系管理员"
            if not user.is_active:
                return None, None, "账号已被禁用"

            access_token = (token_data or {}).get("access_token")
            if not access_token:
                return None, None, "登录失败：未获取访问令牌"

            auth_payload: Dict[str, Any] = {
                "access_token": access_token,
                "refresh_token": (token_data or {}).get("refresh_token"),
                "expires_in": (token_data or {}).get("expires_in"),
                "token_type": (token_data or {}).get("token_type", "bearer"),
            }
            return auth_payload, user, None

        # Legacy 模式：本地密码校验 + 本地 JWT（兼容用户名/邮箱）
        if "@" in normalized_identifier:
            user = await crud.get_user_by_email(db, normalized_identifier.lower())
            if not user or not verify_password(password, user.password_hash):
                user = None
        else:
            user = await crud.authenticate_user(db, normalized_identifier, password)
        if not user:
            return None, None, "用户名或密码错误"
        if not user.is_active:
            return None, None, "账号已被禁用"

        access_token = create_access_token(
            data={"sub": str(user.id), "username": user.username, "role": user.role},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {
            "access_token": access_token,
            "refresh_token": None,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "token_type": "bearer",
        }, user, None

    @staticmethod
    async def refresh_login(
        db: AsyncSession,
        refresh_token: str
    ) -> tuple[Optional[Dict[str, Any]], Optional[User], Optional[str]]:
        """
        刷新登录令牌
        返回: (auth_payload, user, error_message)
        """
        if not AuthService._use_supabase_auth():
            return None, None, "当前认证模式不支持刷新令牌"

        token_data, error = await supabase_auth_service.refresh_token(refresh_token)
        if error:
            return None, None, error

        supabase_user = (token_data or {}).get("user") or {}
        supabase_auth_id = supabase_user.get("id")
        if not supabase_auth_id:
            return None, None, "刷新失败：未获取到用户身份"

        user = await crud.get_user_by_supabase_auth_id(db, supabase_auth_id)
        if not user:
            email = str(supabase_user.get("email") or "").lower()
            if email:
                existing = await crud.get_user_by_email(db, email)
                if existing:
                    user = await crud.update_user(db, existing.id, supabase_auth_id=supabase_auth_id)

        if not user:
            return None, None, "账号未初始化，请联系管理员"
        if not user.is_active:
            return None, None, "账号已被禁用"

        access_token = (token_data or {}).get("access_token")
        if not access_token:
            return None, None, "刷新失败：未获取访问令牌"

        return {
            "access_token": access_token,
            "refresh_token": (token_data or {}).get("refresh_token"),
            "expires_in": (token_data or {}).get("expires_in"),
            "token_type": (token_data or {}).get("token_type", "bearer"),
        }, user, None

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
        if AuthService._use_supabase_auth():
            if not user.supabase_auth_id:
                return False, "账号尚未迁移到新认证系统"

            _, login_error = await supabase_auth_service.password_login(user.email, old_password)
            if login_error:
                return False, "原密码错误"

            success, update_error = await supabase_auth_service.admin_update_password(
                supabase_user_id=user.supabase_auth_id,
                new_password=new_password,
            )
            if not success:
                return False, update_error or "密码更新失败"

            await crud.update_user(
                db,
                user.id,
                password_hash=get_password_hash(new_password),
                password_encrypted=encrypt_password(new_password),
            )
            return True, None

        # Legacy 模式
        if not verify_password(old_password, user.password_hash):
            return False, "原密码错误"
        await crud.update_user(
            db,
            user.id,
            password_hash=get_password_hash(new_password),
            password_encrypted=encrypt_password(new_password),
        )
        return True, None

    @staticmethod
    async def reset_password_by_email(
        db: AsyncSession,
        email: str,
        new_password: str,
    ) -> tuple[bool, Optional[str]]:
        """按邮箱重置密码"""
        normalized_email = email.strip().lower()
        user = await crud.get_user_by_email(db, normalized_email)
        if not user:
            return False, "该邮箱未注册"

        if AuthService._use_supabase_auth():
            if not user.supabase_auth_id:
                return False, "账号尚未迁移到新认证系统"
            success, update_error = await supabase_auth_service.admin_update_password(
                supabase_user_id=user.supabase_auth_id,
                new_password=new_password,
            )
            if not success:
                return False, update_error or "密码重置失败"

        await crud.update_user(
            db,
            user.id,
            password_hash=get_password_hash(new_password),
            password_encrypted=encrypt_password(new_password),
        )
        return True, None

    @staticmethod
    async def create_default_users(db: AsyncSession) -> None:
        """
        创建默认账号（管理员和普通用户）
        """
        # Supabase Auth 模式下不创建硬编码默认账户
        if AuthService._use_supabase_auth():
            return

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
