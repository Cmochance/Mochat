"""
认证相关的Pydantic模型
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from pydantic import model_validator
from .user import UserResponse


class RegisterRequest(BaseModel):
    """注册请求模型"""
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="邮箱验证码")


class LoginRequest(BaseModel):
    """登录请求模型"""
    identifier: Optional[str] = None  # 用户名或邮箱
    username: Optional[str] = None  # 兼容旧客户端
    password: str

    @model_validator(mode="after")
    def validate_identifier(self):
        if not (self.identifier or self.username):
            raise ValueError("identifier 或 username 至少提供一个")
        return self


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模型"""
    refresh_token: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """令牌响应模型"""
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    """登录响应模型"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    token_type: str = "bearer"
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    """修改密码请求模型"""
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=100)


class ResetPasswordRequest(BaseModel):
    """重置密码请求模型"""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="邮箱验证码")
    new_password: str = Field(..., min_length=6, max_length=100)
