"""
Cookie 安全模块 - HttpOnly Cookie 管理

Refresh token 通过 HttpOnly Cookie 传输，防止 XSS 攻击窃取。
Access token 仍通过 Authorization header 传输（Bearer token）。
"""

import logging
from datetime import timedelta
from typing import Optional

from fastapi import Request, Response

from .config import settings
from .security import create_access_token, decode_access_token

logger = logging.getLogger(__name__)

# Cookie 名称常量
REFRESH_TOKEN_COOKIE_NAME = "mochat_refresh_token"


def _build_cookie_params(
    max_age: int,
    path: str = "/api/auth",
) -> dict:
    """
    构建 Cookie 参数，根据环境自动适配安全策略
    
    开发环境（localhost）: Secure=False（HTTP 也能传 Cookie）
    生产环境: Secure=True（仅 HTTPS）, SameSite=Lax
    """
    is_dev = settings.DEBUG or "localhost" in settings.CORS_ORIGINS

    params = {
        "max_age": max_age,
        "path": path,
        "httponly": True,
        "samesite": settings.COOKIE_SAMESITE,
        "secure": settings.COOKIE_SECURE and not is_dev,
    }

    if settings.COOKIE_DOMAIN:
        params["domain"] = settings.COOKIE_DOMAIN

    return params


def set_refresh_token_cookie(
    response: Response,
    refresh_token: str,
) -> None:
    """在响应中设置 refresh token 的 HttpOnly Cookie"""
    max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # 转为秒
    params = _build_cookie_params(max_age=max_age, path="/api/auth")
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        **params,
    )
    logger.debug("已设置 refresh token Cookie（HttpOnly）")


def clear_refresh_token_cookie(response: Response) -> None:
    """清除 refresh token Cookie（登出时调用）"""
    params = _build_cookie_params(max_age=0, path="/api/auth")
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        **{k: v for k, v in params.items() if k != "max_age"},
    )
    logger.debug("已清除 refresh token Cookie")


def get_refresh_token_from_cookie(request: Request) -> Optional[str]:
    """从请求的 Cookie 中读取 refresh token"""
    return request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)


def create_refresh_token(user_id: int) -> str:
    """创建 refresh token（JWT 格式，有效期较长，包含 type=refresh 标记）"""
    expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return create_access_token(
        data={"sub": str(user_id), "type": "refresh"},
        expires_delta=expires,
    )


def verify_refresh_token(token: str) -> Optional[int]:
    """
    验证 refresh token 并返回 user_id
    仅接受 type=refresh 的 token，拒绝 access token 被复用
    """
    payload = decode_access_token(token)
    if payload is None:
        return None

    if payload.get("type") != "refresh":
        logger.warning("非 refresh token 被用于刷新: type=%s", payload.get("type"))
        return None

    user_id_str = payload.get("sub")
    if not user_id_str:
        return None

    try:
        return int(user_id_str)
    except (ValueError, TypeError):
        return None
