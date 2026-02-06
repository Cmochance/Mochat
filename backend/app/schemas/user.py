"""
用户相关的Pydantic模型
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr


class UserCreate(UserBase):
    """用户创建模型"""
    password: str = Field(..., min_length=6, max_length=100)


class UserUpdate(BaseModel):
    """用户更新模型"""
    username: Optional[str] = Field(None, min_length=2, max_length=50)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    tier: Optional[str] = None  # 用户等级
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """用户响应模型"""
    id: int
    role: str
    tier: Optional[str] = "free"  # 用户等级
    is_active: bool
    last_seen_version: Optional[str] = None  # 用户已阅读的最新版本号
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserAdminResponse(UserResponse):
    """管理员用户响应模型（包含密码哈希用于调试）"""
    password_hash: str
    
    class Config:
        from_attributes = True


class UserProfile(BaseModel):
    """用户个人资料"""
    id: int
    username: str
    email: str
    role: str
    tier: Optional[str] = "free"  # 用户等级
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserUsageResponse(BaseModel):
    """用户使用量响应模型"""
    tier: str
    tier_name_zh: str
    tier_name_en: str
    chat_limit: int
    chat_used: int
    chat_remaining: int
    image_limit: int
    image_used: int
    image_remaining: int
    is_unlimited: bool
    reset_date: Optional[str] = None


class TierUpdateRequest(BaseModel):
    """等级更新请求"""
    tier: str = Field(..., pattern="^(free|pro|plus)$")
