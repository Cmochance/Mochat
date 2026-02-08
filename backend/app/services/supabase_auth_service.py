"""
Supabase Auth 适配层
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import httpx

from ..core.config import settings


class SupabaseAuthService:
    """封装 Supabase Auth REST API 调用"""

    def __init__(self) -> None:
        self._timeout = httpx.Timeout(20.0, connect=10.0)

    @property
    def enabled(self) -> bool:
        return (
            bool(settings.SUPABASE_URL)
            and bool(settings.SUPABASE_ANON_KEY)
            and bool(settings.SUPABASE_SERVICE_ROLE_KEY)
        )

    def _auth_url(self, path: str) -> str:
        base = settings.SUPABASE_URL.rstrip("/")
        return f"{base}/auth/v1/{path.lstrip('/')}"

    def _public_headers(self) -> Dict[str, str]:
        return {
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

    def _service_headers(self) -> Dict[str, str]:
        return {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _extract_error(payload: Any, default: str) -> str:
        if isinstance(payload, dict):
            for key in ("msg", "message", "error_description", "error"):
                value = payload.get(key)
                if value:
                    return str(value)
        return default

    async def password_login(self, email: str, password: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.enabled:
            return None, "Supabase 配置未完整设置"

        url = self._auth_url("token?grant_type=password")
        payload = {"email": email, "password": password}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=payload, headers=self._public_headers())
        if response.status_code >= 400:
            try:
                data = response.json()
            except Exception:
                data = None
            return None, self._extract_error(data, "登录失败，请检查账号或密码")
        return response.json(), None

    async def refresh_token(self, refresh_token: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.enabled:
            return None, "Supabase 配置未完整设置"

        url = self._auth_url("token?grant_type=refresh_token")
        payload = {"refresh_token": refresh_token}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=payload, headers=self._public_headers())
        if response.status_code >= 400:
            try:
                data = response.json()
            except Exception:
                data = None
            return None, self._extract_error(data, "刷新登录态失败，请重新登录")
        return response.json(), None

    async def get_user(self, access_token: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.enabled:
            return None, "Supabase 配置未完整设置"

        url = self._auth_url("user")
        headers = self._public_headers()
        headers["Authorization"] = f"Bearer {access_token}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=headers)
        if response.status_code >= 400:
            try:
                data = response.json()
            except Exception:
                data = None
            return None, self._extract_error(data, "访问令牌无效")
        return response.json(), None

    async def admin_create_user(
        self,
        *,
        email: str,
        password: str,
        email_confirm: bool = True,
        user_metadata: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self.enabled:
            return None, "Supabase 配置未完整设置"

        payload: Dict[str, Any] = {
            "email": email,
            "password": password,
            "email_confirm": email_confirm,
        }
        if user_metadata:
            payload["user_metadata"] = user_metadata

        url = self._auth_url("admin/users")
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=payload, headers=self._service_headers())
        if response.status_code >= 400:
            try:
                data = response.json()
            except Exception:
                data = None
            return None, self._extract_error(data, "创建 Supabase 用户失败")
        return response.json(), None

    async def admin_update_password(
        self,
        *,
        supabase_user_id: str,
        new_password: str,
    ) -> Tuple[bool, Optional[str]]:
        if not self.enabled:
            return False, "Supabase 配置未完整设置"
        url = self._auth_url(f"admin/users/{supabase_user_id}")
        payload = {"password": new_password}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.put(url, json=payload, headers=self._service_headers())
        if response.status_code >= 400:
            try:
                data = response.json()
            except Exception:
                data = None
            return False, self._extract_error(data, "更新 Supabase 密码失败")
        return True, None


supabase_auth_service = SupabaseAuthService()

