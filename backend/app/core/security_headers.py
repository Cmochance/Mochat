"""
安全 HTTP 头中间件

添加以下安全相关的响应头:
- Content-Security-Policy (CSP): 限制资源加载来源
- X-Content-Type-Options: 防止 MIME 类型嗅探
- X-Frame-Options: 防止点击劫持
- X-XSS-Protection: XSS 过滤（旧浏览器兼容）
- Referrer-Policy: 控制 Referrer 信息泄露
- Permissions-Policy: 限制浏览器 API 使用
- Strict-Transport-Security (HSTS): 强制 HTTPS（仅生产环境）
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from .config import settings

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    安全 HTTP 头中间件
    为所有响应添加安全相关的 HTTP 头
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # X-Content-Type-Options: 防止浏览器 MIME 类型嗅探
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-Frame-Options: 防止页面被嵌入 iframe（防止点击劫持）
        response.headers["X-Frame-Options"] = "DENY"

        # X-XSS-Protection: 启用浏览器内置 XSS 过滤器（旧浏览器兼容）
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer-Policy: 控制 Referer 头信息
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy: 限制浏览器功能（按需开放）
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"

        # Content-Security-Policy: 限制资源加载来源
        # 开发模式允许 localhost 和 eval/inline（开发工具需要）
        if settings.DEBUG:
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob: https:; "
                "font-src 'self' data:; "
                "connect-src 'self' http://localhost:* https://localhost:* ws://localhost:*; "
                "frame-ancestors 'none'"
            )
        else:
            csp = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "  # TailwindCSS 需要 inline styles
                "img-src 'self' data: blob: https:; "
                "font-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'"
            )
        response.headers["Content-Security-Policy"] = csp

        # Strict-Transport-Security (HSTS): 强制 HTTPS
        # 仅在生产环境且非 localhost 时启用
        is_localhost = "localhost" in str(request.url) or "127.0.0.1" in str(request.url)
        if not settings.DEBUG and not is_localhost:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Cache-Control: 敏感页面禁止缓存
        path = request.url.path
        if path.startswith("/api/auth/") or path.startswith("/api/user/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"

        return response
