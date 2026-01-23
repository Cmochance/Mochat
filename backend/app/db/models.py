"""
数据库模型定义
"""
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    """用户模型"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
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


class UserUsage(Base):
    """用户使用量追踪模型"""
    __tablename__ = "user_usages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    chat_count = Column(Integer, default=0)  # 今日对话次数
    image_count = Column(Integer, default=0)  # 今日生图次数
    reset_date = Column(Date, default=date.today)  # 使用量重置日期
    
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
