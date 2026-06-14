"""
认证API路由 - 处理登录、注册、登出、重置密码

安全策略:
- Access token 通过 Authorization header (Bearer) 传输
- Refresh token 优先通过 HttpOnly Cookie 传输（防 XSS）
- 兼容旧客户端通过 body 传递 refresh_token 的方式
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from verify import VerificationService
from verify.config import config as verify_config

from ..core.config import settings
from ..core.cookie_security import (
    clear_refresh_token_cookie,
    create_refresh_token,
    get_refresh_token_from_cookie,
    set_refresh_token_cookie,
    verify_refresh_token,
)
from ..core.dependencies import get_current_active_user
from ..core.rate_limit import check_auth_rate_limit
from ..core.security import create_access_token
from ..core.security_audit import (
    log_login_failure,
    log_login_success,
    log_password_change,
    log_password_reset,
    log_register_success,
    log_token_refresh_failure,
    log_token_refresh_success,
)
from ..db import crud
from ..db.database import get_db
from ..db.models import User
from ..schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
)
from ..schemas.user import UserResponse
from ..services.auth_service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    check_auth_rate_limit(http_request, endpoint="register")
    """
    用户注册

    需要先通过 /api/verify/send 发送验证码到邮箱
    """
    # 验证验证码
    is_valid, msg, _ = await VerificationService.verify_code(
        db, email=request.email, code=request.code, purpose=verify_config.PURPOSE_REGISTER
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    # 验证密码格式
    is_valid, error_msg = AuthService.validate_password(request.password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # 注册用户
    user, error = await AuthService.register(
        db, username=request.username, email=request.email, password=request.password
    )

    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    # 消费验证（防止重复使用）
    await VerificationService.consume_verification(db, request.email, verify_config.PURPOSE_REGISTER)

    log_register_success(user_id=user.id)

    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    request_body: LoginRequest, response: Response, http_request: Request, db: AsyncSession = Depends(get_db)
):
    """用户登录"""

    check_auth_rate_limit(http_request, endpoint="login")

    identifier = request_body.identifier or request_body.username or ""
    auth_payload, user, error = await AuthService.login(db, identifier=identifier, password=request_body.password)

    if error or not auth_payload or not user:
        log_login_failure(
            identifier=identifier,
            ip=http_request.client.host if http_request.client else None,
            reason=error or "登录失败",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error or "登录失败")

    log_login_success(user_id=user.id, ip=http_request.client.host if http_request.client else None)

    # 为 legacy 模式生成自己的 refresh token，存入 HttpOnly Cookie
    legacy_refresh_token = None
    if not AuthService._use_supabase_auth():
        legacy_refresh_token = create_refresh_token(user.id)
        set_refresh_token_cookie(response, legacy_refresh_token)

    return LoginResponse(
        access_token=auth_payload["access_token"],
        # Supabase 模式仍返回 body 中的 refresh_token
        # Legacy 模式不再通过 body 返回（通过 Cookie 传输）
        refresh_token=auth_payload.get("refresh_token") if AuthService._use_supabase_auth() else None,
        expires_in=auth_payload.get("expires_in"),
        token_type=auth_payload.get("token_type", "bearer"),
        user=UserResponse.model_validate(user),
    )


async def _refresh_supabase(
    db: AsyncSession,
    body: RefreshTokenRequest | None,
) -> LoginResponse:
    """Supabase 模式: 从 body 获取 refresh token 并刷新"""
    refresh_token_str = body.refresh_token if body else None
    if not refresh_token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 refresh_token",
        )

    auth_payload, user, error = await AuthService.refresh_login(db, refresh_token=refresh_token_str)
    if error or not auth_payload or not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error or "刷新失败")

    return LoginResponse(
        access_token=auth_payload["access_token"],
        refresh_token=auth_payload.get("refresh_token"),
        expires_in=auth_payload.get("expires_in"),
        token_type=auth_payload.get("token_type", "bearer"),
        user=UserResponse.model_validate(user),
    )


async def _refresh_legacy(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None,
    db: AsyncSession,
) -> LoginResponse:
    """Legacy 模式: 优先从 Cookie 获取 refresh token，回退到 body"""
    cookie_token = get_refresh_token_from_cookie(request)

    token_str = cookie_token
    if not token_str and body and body.refresh_token:
        token_str = body.refresh_token
        logger.info("refresh token 来自请求 body（兼容模式）")

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 refresh token（Cookie 或 body）",
        )

    client_ip = request.client.host if request.client else None

    user_id = verify_refresh_token(token_str)
    if user_id is None:
        clear_refresh_token_cookie(response)
        log_token_refresh_failure(ip=client_ip, reason="refresh token 无效或已过期")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh token 无效或已过期",
        )

    user = await crud.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        clear_refresh_token_cookie(response)
        log_token_refresh_failure(ip=client_ip, reason=f"用户不存在或已禁用: user_id={user_id}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
        )

    new_access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(user.id)
    set_refresh_token_cookie(response, new_refresh_token)

    log_token_refresh_success(user_id=user.id, ip=client_ip, source="cookie" if cookie_token else "body")

    return LoginResponse(
        access_token=new_access_token,
        refresh_token=None,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    刷新访问令牌

    安全策略（兼容双模式）:
    1. 优先从 HttpOnly Cookie 读取 refresh token（推荐）
    2. 回退到请求 body 中的 refresh_token（兼容旧客户端和 Supabase 模式）
    """
    check_auth_rate_limit(request, endpoint="refresh")

    if AuthService._use_supabase_auth():
        return await _refresh_supabase(db, body)

    return await _refresh_legacy(request, response, body, db)


@router.post("/logout")
async def logout(response: Response):
    """
    用户登出

    清除 HttpOnly Cookie 中的 refresh token。
    客户端也应清除本地存储的 access token。
    """
    clear_refresh_token_cookie(response)
    return {"message": "登出成功"}


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """修改密码（需登录）"""
    # 验证新密码格式
    is_valid, error_msg = AuthService.validate_password(request.new_password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    success, error = await AuthService.change_password(
        db, user=current_user, old_password=request.old_password, new_password=request.new_password
    )

    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    # 密码修改后清除 refresh token，强制重新登录
    clear_refresh_token_cookie(response)

    log_password_change(user_id=current_user.id)

    return {"message": "密码修改成功，请重新登录"}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    """
    重置密码（忘记密码）

    需要先通过 /api/verify/send 发送验证码到邮箱
    """
    check_auth_rate_limit(http_request, endpoint="reset_password")

    # 验证验证码
    is_valid, msg, _ = await VerificationService.verify_code(
        db, email=request.email, code=request.code, purpose=verify_config.PURPOSE_RESET_PASSWORD
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    # 验证新密码格式
    is_valid, error_msg = AuthService.validate_password(request.new_password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    success, error = await AuthService.reset_password_by_email(
        db,
        email=request.email,
        new_password=request.new_password,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    # 消费验证
    await VerificationService.consume_verification(db, request.email, verify_config.PURPOSE_RESET_PASSWORD)

    log_password_reset(email=request.email)

    return {"message": "密码重置成功"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """获取当前用户信息"""
    return current_user
