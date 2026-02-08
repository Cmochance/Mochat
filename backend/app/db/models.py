"""
数据库模型定义
"""
from datetime import datetime, date
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Date,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    supabase_auth_id = Column(String(64), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    password_encrypted = Column(String(500), nullable=True)  # AES加密的密码（管理员可查看）
    role = Column(String(20), default="user")  # user, admin
    tier = Column(String(20), default="free")  # free, pro, plus (用户等级)
    is_active = Column(Boolean, default=True)
    last_seen_version = Column(String(20), nullable=True)  # 用户已阅读的最新版本号
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    usage = relationship("UserUsage", back_populates="user", uselist=False, cascade="all, delete-orphan")
    usage_events = relationship("UsageEvent", back_populates="user", cascade="all, delete-orphan")
    usage_daily_aggregates = relationship("UsageDailyAggregate", back_populates="user", cascade="all, delete-orphan")


class UserUsage(Base):
    """用户使用量追踪模型"""
    __tablename__ = "user_usages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    chat_count = Column(Integer, default=0)  # 今日对话次数
    image_count = Column(Integer, default=0)  # 今日生图次数
    reset_date = Column(Date, default=date.today)  # 使用量重置日期
    total_chat_count = Column(Integer, default=0)  # 累计对话次数
    total_image_count = Column(Integer, default=0)  # 累计生图次数
    total_ppt_count = Column(Integer, default=0)  # 累计PPT次数
    last_used_at = Column(DateTime, nullable=True)
    last_chat_at = Column(DateTime, nullable=True)
    last_image_at = Column(DateTime, nullable=True)
    last_ppt_at = Column(DateTime, nullable=True)
    
    # 关联
    user = relationship("User", back_populates="usage")


class ChatSession(Base):
    """对话会话模型"""
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="新对话")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")


class UsageEvent(Base):
    """用户使用量事件流水（事实表）"""
    __tablename__ = "usage_events"
    __table_args__ = (
        UniqueConstraint("user_id", "action", "request_id", name="uq_usage_events_user_action_request"),
        Index("idx_usage_events_user_occurred_at", "user_id", "occurred_at"),
        Index("idx_usage_events_action_status_time", "action", "status", "occurred_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(20), nullable=False, index=True)  # chat/image/ppt
    status = Column(String(20), nullable=False, index=True)  # success/failed
    request_id = Column(String(64), nullable=False)
    session_id = Column(Integer, nullable=True)
    amount = Column(Integer, nullable=False, default=1)
    error_code = Column(String(100), nullable=True)
    source = Column(String(50), nullable=False, default="backend")
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="usage_events")


class UsageDailyAggregate(Base):
    """用户使用量日聚合表"""
    __tablename__ = "usage_daily_aggregates"
    __table_args__ = (
        Index("idx_usage_daily_user_date", "user_id", "stat_date"),
    )

    stat_date = Column(Date, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    action = Column(String(20), primary_key=True)  # chat/image/ppt
    status = Column(String(20), primary_key=True)  # success/failed
    count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="usage_daily_aggregates")


class Message(Base):
    """消息模型"""
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    thinking = Column(Text, nullable=True)  # AI思考过程
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关联
    session = relationship("ChatSession", back_populates="messages")


class SystemConfig(Base):
    """系统配置模型"""
    __tablename__ = "system_config"
    
    key = Column(String(50), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RestrictedKeyword(Base):
    """限制词模型"""
    __tablename__ = "restricted_keywords"
    
    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class AllowedModel(Base):
    """允许显示的模型"""
    __tablename__ = "allowed_models"
    
    id = Column(Integer, primary_key=True, index=True)
    model_id = Column(String(200), unique=True, nullable=False, index=True)  # 模型ID
    display_name = Column(String(200), nullable=True)  # 自定义显示名称（可选）
    is_active = Column(Boolean, default=True)  # 是否启用
    sort_order = Column(Integer, default=0)  # 排序顺序
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VerificationCode(Base):
    """验证码持久化表"""
    __tablename__ = "verification_codes"
    __table_args__ = (
        UniqueConstraint("email", "purpose", name="uq_verification_codes_email_purpose"),
        Index("idx_verification_codes_expires_at", "expires_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    purpose = Column(String(50), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    verified = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=False)


class VerificationIPLimit(Base):
    """验证码IP限流持久化表"""
    __tablename__ = "verification_ip_limits"

    ip = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False, default=0)
    reset_at = Column(DateTime, nullable=False)
