"""
统一错误处理模块

功能:
- 全局异常处理器（未捕获异常、HTTP 异常、请求验证异常）
- 统一的错误响应格式
- 错误日志脱敏（不泄露内部堆栈给客户端）
- 安全相关错误的审计记录
"""

import logging
import traceback

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """应用级错误基类，可携带错误码"""

    def __init__(
        self,
        message: str = "服务内部错误",
        status_code: int = 500,
        error_code: str = "internal_error",
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.message)


class AuthenticationError(AppError):
    """认证错误"""

    def __init__(self, message: str = "认证失败"):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="authentication_error",
        )


class PermissionDeniedError(AppError):
    """权限不足错误"""

    def __init__(self, message: str = "权限不足"):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="permission_denied",
        )


class ResourceNotFoundError(AppError):
    """资源不存在错误"""

    def __init__(self, message: str = "资源不存在"):
        super().__init__(
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="resource_not_found",
        )


class RateLimitError(AppError):
    """速率限制错误"""

    def __init__(self, message: str = "请求过于频繁，请稍后再试", retry_after: int = 60):
        super().__init__(
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_code="rate_limit_exceeded",
        )
        self.retry_after = retry_after


def _build_error_response(
    status_code: int,
    message: str,
    error_code: str = "error",
    details: list | None = None,
) -> JSONResponse:
    """
    构建统一的错误响应格式

    客户端收到的格式:
    {
        "error": {
            "code": "validation_error",
            "message": "请求参数验证失败",
            "details": [...]
        }
    }
    """
    body: dict = {
        "error": {
            "code": error_code,
            "message": message,
        }
    }
    if details:
        body["error"]["details"] = details

    return JSONResponse(status_code=status_code, content=body)


def register_error_handlers(app: FastAPI) -> None:
    """
    在 FastAPI 应用上注册全局错误处理器

    用法: 在 main.py 中调用 register_error_handlers(app)
    """

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        """处理应用级错误"""
        logger.warning(
            "AppError: code=%s, path=%s, message=%s",
            exc.error_code,
            request.url.path,
            exc.message,
        )
        return _build_error_response(
            status_code=exc.status_code,
            message=exc.message,
            error_code=exc.error_code,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """
        处理 HTTP 异常
        将 detail 字符串或 dict 包装为统一格式
        """
        # 提取用户友好的消息
        if isinstance(exc.detail, dict):
            message = exc.detail.get("detail", exc.detail.get("message", str(exc.detail)))
            error_code = exc.detail.get("error", f"http_{exc.status_code}")
            details = exc.detail.get("details")
        else:
            message = str(exc.detail)
            error_code = f"http_{exc.status_code}"
            details = None

        # 5xx 错误记录详细日志
        if exc.status_code >= 500:
            logger.error(
                "HTTP %d: path=%s, detail=%s",
                exc.status_code,
                request.url.path,
                exc.detail,
            )

        return _build_error_response(
            status_code=exc.status_code,
            message=message,
            error_code=error_code,
            details=details if isinstance(details, list) else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """
        处理请求验证错误（Pydantic 验证失败）
        返回具体的字段错误信息，帮助前端调试
        """
        errors = []
        for err in exc.errors():
            field = ".".join(str(loc) for loc in err.get("loc", []))
            errors.append(
                {
                    "field": field,
                    "message": err.get("msg", ""),
                    "type": err.get("type", ""),
                }
            )

        logger.info(
            "Validation error: path=%s, errors_count=%d",
            request.url.path,
            len(errors),
        )

        return _build_error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message="请求参数验证失败",
            error_code="validation_error",
            details=errors,
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """
        处理所有未捕获的异常
        不向客户端泄露内部错误详情
        """
        # 记录完整的堆栈信息（仅服务端日志）
        logger.error(
            "Unhandled exception: path=%s, method=%s\n%s",
            request.url.path,
            request.method,
            traceback.format_exc(),
        )

        # 返回通用错误消息
        return _build_error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="服务内部错误，请稍后重试",
            error_code="internal_error",
        )
