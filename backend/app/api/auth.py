"""
认证API路由 - 处理登录、注册、登出、重置密码
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db import crud
from ..schemas.auth import (
    RegisterRequest, 
    LoginRequest, 
    LoginResponse,
    ChangePasswordRequest,
    ResetPasswordRequest
)
from ..schemas.user import UserResponse
from ..services.auth_service import AuthService
from ..core.dependencies import get_current_active_user
from ..core.security import get_password_hash
from ..db.models import User

# 导入验证码服务
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
from verify import VerificationService
from verify.config import config as verify_config

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册
    
    需要先通过 /api/verify/send 发送验证码到邮箱
    """
    # 验证验证码
    is_valid, msg, _ = VerificationService.verify_code(
        email=request.email,
        code=request.code,
        purpose=verify_config.PURPOSE_REGISTER
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    
    # 验证密码格式
    is_valid, error_msg = AuthService.validate_password(request.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 注册用户
    user, error = await AuthService.register(
        db,
        username=request.username,
        email=request.email,
        password=request.password
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # 消费验证（防止重复使用）
    VerificationService.consume_verification(request.email, verify_config.PURPOSE_REGISTER)
    
    return user


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """用户登录"""
    token, user, error = await AuthService.login(
        db,
        username=request.username,
        password=request.password
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error
        )
    
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/logout")
async def logout():
    """用户登出（客户端清除token即可）"""
    return {"message": "登出成功"}


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码（需登录）"""
    # 验证新密码格式
    is_valid, error_msg = AuthService.validate_password(request.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    success, error = await AuthService.change_password(
        db,
        user=current_user,
        old_password=request.old_password,
        new_password=request.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "密码修改成功"}


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    重置密码（忘记密码）
    
    需要先通过 /api/verify/send 发送验证码到邮箱
    """
    # 验证验证码
    is_valid, msg, _ = VerificationService.verify_code(
        email=request.email,
        code=request.code,
        purpose=verify_config.PURPOSE_RESET_PASSWORD
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    
    # 验证新密码格式
    is_valid, error_msg = AuthService.validate_password(request.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 查找用户
    user = await crud.get_user_by_email(db, request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该邮箱未注册"
        )
    
    # 更新密码
    await crud.update_user(
        db,
        user.id,
        password_hash=get_password_hash(request.new_password)
    )
    await db.commit()
    
    # 消费验证
    VerificationService.consume_verification(request.email, verify_config.PURPOSE_RESET_PASSWORD)
    
    return {"message": "密码重置成功"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """获取当前用户信息"""
    return current_user
