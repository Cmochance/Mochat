"""
CRUD操作封装
"""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from .models import User, ChatSession, Message, SystemConfig, RestrictedKeyword
from ..core.security import get_password_hash, verify_password, encrypt_password


# ============ 用户相关 CRUD ============

async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """根据ID获取用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """根据用户名获取用户"""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """根据邮箱获取用户"""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession, 
    username: str, 
    email: str, 
    password: str,
    role: str = "user"
) -> User:
    """创建新用户"""
    user = User(
        username=username,
        email=email,
        password_hash=get_password_hash(password),
        password_encrypted=encrypt_password(password),  # 存储加密密码
        role=role
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def authenticate_user(
    db: AsyncSession, 
    username: str, 
    password: str
) -> Optional[User]:
    """验证用户登录"""
    user = await get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def get_all_users(
    db: AsyncSession, 
    skip: int = 0, 
    limit: int = 100
) -> List[User]:
    """获取所有用户"""
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    )
    return result.scalars().all()


async def update_user(
    db: AsyncSession,
    user_id: int,
    **kwargs
) -> Optional[User]:
    """更新用户信息"""
    await db.execute(
        update(User).where(User.id == user_id).values(**kwargs)
    )
    await db.flush()
    return await get_user_by_id(db, user_id)


async def delete_user(db: AsyncSession, user_id: int) -> bool:
    """删除用户"""
    result = await db.execute(delete(User).where(User.id == user_id))
    return result.rowcount > 0


async def get_user_count(db: AsyncSession) -> int:
    """获取用户总数"""
    result = await db.execute(select(func.count(User.id)))
    return result.scalar()


# ============ 会话相关 CRUD ============

async def create_session(
    db: AsyncSession, 
    user_id: int, 
    title: str = "新对话"
) -> ChatSession:
    """创建新会话"""
    session = ChatSession(user_id=user_id, title=title)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_session_by_id(
    db: AsyncSession, 
    session_id: int
) -> Optional[ChatSession]:
    """根据ID获取会话"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def get_user_sessions(
    db: AsyncSession, 
    user_id: int,
    skip: int = 0,
    limit: int = 50
) -> List[ChatSession]:
    """获取用户的所有会话"""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def update_session(
    db: AsyncSession,
    session_id: int,
    **kwargs
) -> Optional[ChatSession]:
    """更新会话"""
    await db.execute(
        update(ChatSession).where(ChatSession.id == session_id).values(**kwargs)
    )
    await db.flush()
    return await get_session_by_id(db, session_id)


async def delete_session(db: AsyncSession, session_id: int) -> bool:
    """删除会话"""
    result = await db.execute(delete(ChatSession).where(ChatSession.id == session_id))
    return result.rowcount > 0


async def get_session_count(db: AsyncSession) -> int:
    """获取会话总数"""
    result = await db.execute(select(func.count(ChatSession.id)))
    return result.scalar()


# ============ 消息相关 CRUD ============

async def create_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    thinking: Optional[str] = None
) -> Message:
    """创建新消息"""
    message = Message(
        session_id=session_id,
        role=role,
        content=content,
        thinking=thinking
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def get_session_messages(
    db: AsyncSession,
    session_id: int,
    limit: int = 100
) -> List[Message]:
    """获取会话的所有消息"""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_session_messages_paginated(
    db: AsyncSession,
    session_id: int,
    limit: int = 10,
    before_id: Optional[int] = None
) -> tuple[List[Message], bool]:
    """
    分页获取会话消息（从新到旧）
    
    Args:
        session_id: 会话 ID
        limit: 获取数量
        before_id: 获取此 ID 之前的消息（用于加载更早的消息）
    
    Returns:
        (消息列表, 是否还有更多消息)
    """
    query = select(Message).where(Message.session_id == session_id)
    
    if before_id:
        query = query.where(Message.id < before_id)
    
    # 按时间倒序获取，这样能拿到最新的 N 条
    query = query.order_by(Message.id.desc()).limit(limit + 1)
    
    result = await db.execute(query)
    messages = list(result.scalars().all())
    
    # 判断是否还有更多消息
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
    
    # 反转为正序（从旧到新）
    messages.reverse()
    
    return messages, has_more


async def get_session_message_count(
    db: AsyncSession,
    session_id: int
) -> int:
    """获取会话消息总数"""
    result = await db.execute(
        select(func.count(Message.id)).where(Message.session_id == session_id)
    )
    return result.scalar() or 0


async def get_message_count(db: AsyncSession) -> int:
    """获取消息总数"""
    result = await db.execute(select(func.count(Message.id)))
    return result.scalar()


# ============ 配置相关 CRUD ============

async def get_config(db: AsyncSession, key: str) -> Optional[str]:
    """获取配置值"""
    result = await db.execute(
        select(SystemConfig.value).where(SystemConfig.key == key)
    )
    return result.scalar_one_or_none()


async def set_config(db: AsyncSession, key: str, value: str) -> SystemConfig:
    """设置配置值"""
    existing = await db.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = existing.scalar_one_or_none()
    
    if config:
        config.value = value
    else:
        config = SystemConfig(key=key, value=value)
        db.add(config)
    
    await db.flush()
    await db.refresh(config)
    return config


# ============ 限制词相关 CRUD ============

async def get_all_keywords(
    db: AsyncSession,
    active_only: bool = False
) -> List[RestrictedKeyword]:
    """获取所有限制词"""
    query = select(RestrictedKeyword).order_by(RestrictedKeyword.created_at.desc())
    if active_only:
        query = query.where(RestrictedKeyword.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_active_keywords(db: AsyncSession) -> List[str]:
    """获取所有启用的限制词（仅返回关键词字符串列表）"""
    result = await db.execute(
        select(RestrictedKeyword.keyword)
        .where(RestrictedKeyword.is_active == True)
    )
    return [row[0] for row in result.fetchall()]


async def add_keyword(
    db: AsyncSession,
    keyword: str,
    created_by: Optional[int] = None
) -> Optional[RestrictedKeyword]:
    """添加限制词"""
    # 检查是否已存在
    existing = await db.execute(
        select(RestrictedKeyword).where(RestrictedKeyword.keyword == keyword)
    )
    if existing.scalar_one_or_none():
        return None  # 已存在
    
    new_keyword = RestrictedKeyword(
        keyword=keyword,
        created_by=created_by
    )
    db.add(new_keyword)
    await db.flush()
    await db.refresh(new_keyword)
    return new_keyword


async def delete_keyword(db: AsyncSession, keyword_id: int) -> bool:
    """删除限制词"""
    result = await db.execute(
        delete(RestrictedKeyword).where(RestrictedKeyword.id == keyword_id)
    )
    return result.rowcount > 0


async def toggle_keyword_status(
    db: AsyncSession,
    keyword_id: int
) -> Optional[RestrictedKeyword]:
    """切换限制词状态"""
    result = await db.execute(
        select(RestrictedKeyword).where(RestrictedKeyword.id == keyword_id)
    )
    keyword = result.scalar_one_or_none()
    if keyword:
        keyword.is_active = not keyword.is_active
        await db.flush()
        await db.refresh(keyword)
    return keyword


async def get_keyword_count(db: AsyncSession) -> int:
    """获取限制词总数"""
    result = await db.execute(select(func.count(RestrictedKeyword.id)))
    return result.scalar()
