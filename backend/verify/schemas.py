"""
验证码模块数据模型
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Literal


class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    email: EmailStr = Field(..., description="接收验证码的邮箱")
    purpose: Literal["register", "reset_password"] = Field(..., description="验证码用途")


class SendCodeResponse(BaseModel):
    """发送验证码响应"""
    success: bool
    message: str
    expires_in: int = Field(default=300, description="验证码有效期（秒）")
    cooldown: int = Field(default=0, description="重新发送冷却时间（秒）")


class VerifyCodeRequest(BaseModel):
    """验证验证码请求（内部使用）"""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    purpose: Literal["register", "reset_password"]


class VerifyCodeResponse(BaseModel):
    """验证验证码响应"""
    success: bool
    message: str
    remaining_attempts: int = Field(default=0, description="剩余尝试次数")
