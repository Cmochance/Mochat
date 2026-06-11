"""
CRUD操作封装
"""
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from .models import (
    User, ChatSession, Message, SystemConfig, RestrictedKeyword, AllowedModel,
    LearningMaterial, StudySession, StudyMessage, MaterialChunk,
    Flashcard, StudyQuiz, QuizQuestion, LearningMap, MaterialAnnotation,
)
from ..core.config import settings
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


async def get_user_by_supabase_auth_id(db: AsyncSession, supabase_auth_id: str) -> Optional[User]:
    """根据 Supabase Auth ID 获取用户"""
    result = await db.execute(select(User).where(User.supabase_auth_id == supabase_auth_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession, 
    username: str, 
    email: str, 
    password: str,
    role: str = "user",
    supabase_auth_id: Optional[str] = None,
) -> User:
    """创建新用户"""
    user = User(
        username=username,
        email=email,
        supabase_auth_id=supabase_auth_id,
        password_hash=get_password_hash(password),
        # Supabase Auth 模式下不再存储可逆加密密码（避免重复存储敏感信息）
        password_encrypted=encrypt_password(password) if settings.AUTH_PROVIDER == "legacy" else None,
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


# ---- 测验 (Quiz) ----


async def create_study_quiz(
    db: AsyncSession,
    material_id: int,
    user_id: int,
    total_questions: int,
) -> StudyQuiz:
    """创建测验"""
    quiz = StudyQuiz(
        material_id=material_id,
        user_id=user_id,
        total_questions=total_questions,
    )
    db.add(quiz)
    await db.flush()
    await db.refresh(quiz)
    return quiz


async def create_quiz_questions(
    db: AsyncSession,
    quiz_id: int,
    questions: list,
) -> list:
    """批量创建测验的题目。questions: [{"question_type": "...", "question_text": "...", "options": "...", "correct_answer": "...", "explanation": "..."}]"""
    objects = []
    for q in questions:
        qq = QuizQuestion(
            quiz_id=quiz_id,
            question_type=q["question_type"],
            question_text=q["question_text"],
            options=q.get("options"),  # 这里已经是 JSON 序列化好的 string 或者 None
            correct_answer=q["correct_answer"],
            explanation=q.get("explanation"),
        )
        db.add(qq)
        objects.append(qq)
    await db.flush()
    for obj in objects:
        await db.refresh(obj)
    return objects


async def get_study_quiz_by_id(
    db: AsyncSession,
    quiz_id: int,
    user_id: int,
) -> Optional[StudyQuiz]:
    """获取单个测验历史详情"""
    result = await db.execute(
        select(StudyQuiz)
        .where(StudyQuiz.id == quiz_id, StudyQuiz.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_quiz_questions(
    db: AsyncSession,
    quiz_id: int,
) -> list:
    """获取一个测验的所有题目"""
    result = await db.execute(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.id.asc())
    )
    return result.scalars().all()


async def get_user_quizzes(
    db: AsyncSession,
    user_id: int,
    material_id: Optional[int] = None,
) -> list:
    """获取用户的测验历史列表"""
    stmt = select(StudyQuiz).where(StudyQuiz.user_id == user_id)
    if material_id is not None:
        stmt = stmt.where(StudyQuiz.material_id == material_id)
    stmt = stmt.order_by(StudyQuiz.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_quiz_question_by_id(
    db: AsyncSession,
    question_id: int,
) -> Optional[QuizQuestion]:
    """获取单道题目内容"""
    result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.id == question_id)
    )
    return result.scalar_one_or_none()


async def submit_quiz_answer(
    db: AsyncSession,
    question_id: int,
    user_answer: str,
    is_correct: bool,
) -> Optional[QuizQuestion]:
    """提交并记录用户回答"""
    result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.id == question_id)
    )
    q = result.scalar_one_or_none()
    if q:
        q.user_answer = user_answer
        q.is_correct = is_correct
        await db.flush()
        await db.refresh(q)
    return q


async def complete_study_quiz(
    db: AsyncSession,
    quiz_id: int,
    score: int,
) -> Optional[StudyQuiz]:
    """完成测验打分"""
    result = await db.execute(
        select(StudyQuiz).where(StudyQuiz.id == quiz_id)
    )
    quiz = result.scalar_one_or_none()
    if quiz:
        quiz.score = score
        quiz.is_completed = True
        await db.flush()
        await db.refresh(quiz)
    return quiz

async def get_wrong_questions(
    db: AsyncSession,
    user_id: int,
    material_id: int,
) -> List[QuizQuestion]:
    """获取指定资料下用户的所有错题"""
    result = await db.execute(
        select(QuizQuestion)
        .join(StudyQuiz)
        .where(
            StudyQuiz.material_id == material_id,
            StudyQuiz.user_id == user_id,
            QuizQuestion.is_correct == False,
        )
        .order_by(QuizQuestion.id.desc())
    )
    return list(result.scalars().all())




# ---- 知识导图 / 图谱 (LearningMap) ----


async def create_learning_map(
    db: AsyncSession,
    material_id: int,
    map_type: str,
    map_data: str,
) -> LearningMap:
    """创建或覆盖导图/关系图谱"""
    # 先删除旧的
    await db.execute(
        delete(LearningMap)
        .where(LearningMap.material_id == material_id, LearningMap.map_type == map_type)
    )
    
    # 插入新的
    lmap = LearningMap(
        material_id=material_id,
        map_type=map_type,
        map_data=map_data,
    )
    db.add(lmap)
    await db.flush()
    await db.refresh(lmap)
    return lmap


async def get_learning_map_by_type(
    db: AsyncSession,
    material_id: int,
    map_type: str,
) -> Optional[LearningMap]:
    """获取指定资料和类型的导图"""
    result = await db.execute(
        select(LearningMap)
        .where(LearningMap.material_id == material_id, LearningMap.map_type == map_type)
    )
    return result.scalar_one_or_none()


# ---- 闪卡 ----


async def create_flashcards(
    db: AsyncSession,
    material_id: int,
    cards: list,
) -> list:
    """批量创建闪卡。cards: [{"front": "...", "back": "..."}]"""
    objects = []
    for card in cards:
        fc = Flashcard(
            material_id=material_id,
            front=card["front"],
            back=card["back"],
        )
        db.add(fc)
        objects.append(fc)
    await db.flush()
    for obj in objects:
        await db.refresh(obj)
    return objects


async def get_flashcards_by_material(
    db: AsyncSession,
    material_id: int,
) -> list:
    """获取资料的所有闪卡"""
    result = await db.execute(
        select(Flashcard)
        .where(Flashcard.material_id == material_id)
        .order_by(Flashcard.created_at.asc())
    )
    return result.scalars().all()


async def get_flashcard_by_id(
    db: AsyncSession,
    card_id: int,
    user_id: int,
) -> Optional[Flashcard]:
    """获取单张闪卡（校验所属用户）"""
    result = await db.execute(
        select(Flashcard)
        .join(LearningMaterial, Flashcard.material_id == LearningMaterial.id)
        .where(Flashcard.id == card_id, LearningMaterial.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_flashcard_status(
    db: AsyncSession,
    card_id: int,
    status: str,
) -> Optional[Flashcard]:
    """更新闪卡状态（new / learning / mastered）"""
    result = await db.execute(
        select(Flashcard).where(Flashcard.id == card_id)
    )
    card = result.scalar_one_or_none()
    if card:
        card.status = status
        card.review_count = (card.review_count or 0) + 1

        # 经典 Leitner 艾宾浩斯复习盒子系统
        box = card.box_number or 1
        if status == "mastered":
            box = min(box + 1, 5)
        else:  # learning / new
            box = 1

        # 各盒子对应的复习时间间隔（天）
        box_intervals = {1: 1, 2: 3, 3: 7, 4: 15, 5: 30}
        interval = box_intervals.get(box, 1)

        card.box_number = box
        card.interval = interval
        card.next_review_at = datetime.now(timezone.utc) + timedelta(days=interval)

        await db.flush()
        await db.refresh(card)
    return card


async def get_due_flashcards_by_material(
    db: AsyncSession,
    material_id: int,
) -> list:
    """获取资料中到期需要复习的闪卡（包括未学习 new 的和 next_review_at 已经过期的）"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Flashcard)
        .where(
            Flashcard.material_id == material_id,
            (Flashcard.next_review_at <= now) | (Flashcard.status == "new")
        )
        .order_by(Flashcard.box_number.asc(), Flashcard.created_at.asc())
    )
    return result.scalars().all()


async def delete_flashcards_by_material(
    db: AsyncSession,
    material_id: int,
) -> int:
    """删除资料的所有闪卡，返回删除数量"""
    result = await db.execute(
        delete(Flashcard).where(Flashcard.material_id == material_id)
    )
    return result.rowcount


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


# ============ 模型管理相关 CRUD ============

async def get_all_allowed_models(
    db: AsyncSession,
    active_only: bool = False
) -> List[AllowedModel]:
    """获取所有允许的模型"""
    query = select(AllowedModel).order_by(AllowedModel.sort_order.asc(), AllowedModel.created_at.asc())
    if active_only:
        query = query.where(AllowedModel.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_active_model_ids(db: AsyncSession) -> List[str]:
    """获取所有启用的模型 ID 列表"""
    result = await db.execute(
        select(AllowedModel.model_id)
        .where(AllowedModel.is_active == True)
        .order_by(AllowedModel.sort_order.asc())
    )
    return [row[0] for row in result.fetchall()]


async def add_allowed_model(
    db: AsyncSession,
    model_id: str,
    display_name: Optional[str] = None,
    sort_order: int = 0
) -> Optional[AllowedModel]:
    """添加允许的模型"""
    # 检查是否已存在
    existing = await db.execute(
        select(AllowedModel).where(AllowedModel.model_id == model_id)
    )
    if existing.scalar_one_or_none():
        return None  # 已存在
    
    new_model = AllowedModel(
        model_id=model_id,
        display_name=display_name,
        sort_order=sort_order
    )
    db.add(new_model)
    await db.flush()
    await db.refresh(new_model)
    return new_model


async def delete_allowed_model(db: AsyncSession, model_db_id: int) -> bool:
    """删除允许的模型"""
    result = await db.execute(
        delete(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    return result.rowcount > 0


async def toggle_model_status(
    db: AsyncSession,
    model_db_id: int
) -> Optional[AllowedModel]:
    """切换模型启用状态"""
    result = await db.execute(
        select(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    model = result.scalar_one_or_none()
    if model:
        model.is_active = not model.is_active
        await db.flush()
        await db.refresh(model)
    return model


async def update_model_sort_order(
    db: AsyncSession,
    model_db_id: int,
    sort_order: int
) -> Optional[AllowedModel]:
    """更新模型排序顺序"""
    result = await db.execute(
        select(AllowedModel).where(AllowedModel.id == model_db_id)
    )
    model = result.scalar_one_or_none()
    if model:
        model.sort_order = sort_order
        await db.flush()
        await db.refresh(model)
    return model


async def get_allowed_model_count(db: AsyncSession) -> int:
    """获取允许的模型总数"""
    result = await db.execute(select(func.count(AllowedModel.id)))
    return result.scalar()


# ============ 学习模块 CRUD ============


async def create_learning_material(
    db: AsyncSession,
    user_id: int,
    title: str,
    file_type: str,
    raw_text: str,
    file_path: Optional[str] = None,
) -> LearningMaterial:
    """创建学习资料"""
    material = LearningMaterial(
        user_id=user_id,
        title=title,
        file_type=file_type,
        raw_text=raw_text,
        file_path=file_path,
    )
    db.add(material)
    await db.flush()
    await db.refresh(material)
    return material


async def get_user_materials(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 50,
) -> List[LearningMaterial]:
    """获取用户的学习资料列表"""
    result = await db.execute(
        select(LearningMaterial)
        .where(LearningMaterial.user_id == user_id)
        .order_by(LearningMaterial.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def get_material_by_id(
    db: AsyncSession,
    material_id: int,
    user_id: int,
) -> Optional[LearningMaterial]:
    """根据 ID 获取学习资料（需校验用户）"""
    result = await db.execute(
        select(LearningMaterial)
        .where(LearningMaterial.id == material_id, LearningMaterial.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_material(db: AsyncSession, material_id: int, user_id: int) -> bool:
    """删除学习资料"""
    result = await db.execute(
        delete(LearningMaterial)
        .where(LearningMaterial.id == material_id, LearningMaterial.user_id == user_id)
    )
    return result.rowcount > 0


async def update_material_summary(
    db: AsyncSession,
    material_id: int,
    summary: str,
) -> None:
    """更新资料摘要"""
    await db.execute(
        update(LearningMaterial)
        .where(LearningMaterial.id == material_id)
        .values(summary=summary)
    )


# ---- 分块 ----


async def create_material_chunks(
    db: AsyncSession,
    material_id: int,
    chunks: List[str],
) -> List[MaterialChunk]:
    """批量创建资料分块"""
    objects = []
    for i, text in enumerate(chunks):
        chunk = MaterialChunk(material_id=material_id, chunk_index=i, content=text)
        db.add(chunk)
        objects.append(chunk)
    await db.flush()
    for obj in objects:
        await db.refresh(obj)
    return objects


async def get_material_chunks(
    db: AsyncSession,
    material_id: int,
) -> List[MaterialChunk]:
    """获取资料的所有分块"""
    result = await db.execute(
        select(MaterialChunk)
        .where(MaterialChunk.material_id == material_id)
        .order_by(MaterialChunk.chunk_index)
    )
    return result.scalars().all()


# ---- 学习会话 ----


async def create_study_session(
    db: AsyncSession,
    user_id: int,
    material_id: int,
    title: str = "学习会话",
) -> StudySession:
    """创建学习会话"""
    session = StudySession(
        user_id=user_id,
        material_id=material_id,
        title=title,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def get_user_study_sessions(
    db: AsyncSession,
    user_id: int,
    material_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
) -> List[StudySession]:
    """获取用户的学习会话列表"""
    stmt = select(StudySession).where(StudySession.user_id == user_id)
    if material_id is not None:
        stmt = stmt.where(StudySession.material_id == material_id)
    stmt = stmt.order_by(StudySession.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_study_session_by_id(
    db: AsyncSession,
    session_id: int,
    user_id: int,
) -> Optional[StudySession]:
    """根据 ID 获取学习会话"""
    result = await db.execute(
        select(StudySession)
        .where(StudySession.id == session_id, StudySession.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def delete_study_session(db: AsyncSession, session_id: int, user_id: int) -> bool:
    """删除学习会话"""
    result = await db.execute(
        delete(StudySession)
        .where(StudySession.id == session_id, StudySession.user_id == user_id)
    )
    return result.rowcount > 0


# ---- 学习消息 ----


async def create_study_message(
    db: AsyncSession,
    session_id: int,
    role: str,
    content: str,
    thinking: Optional[str] = None,
    cited_chunks: Optional[str] = None,
) -> StudyMessage:
    """创建学习消息"""
    msg = StudyMessage(
        session_id=session_id,
        role=role,
        content=content,
        thinking=thinking,
        cited_chunks=cited_chunks,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def get_study_messages(
    db: AsyncSession,
    session_id: int,
    skip: int = 0,
    limit: int = 100,
) -> List[StudyMessage]:
    """获取学习会话的消息列表"""
    result = await db.execute(
        select(StudyMessage)
        .where(StudyMessage.session_id == session_id)
        .order_by(StudyMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


# ---- 划词与批注 (MaterialAnnotation) ----

async def create_annotation(
    db: AsyncSession,
    material_id: int,
    user_id: int,
    selected_text: str,
    note: Optional[str] = None,
    color: str = "yellow",
    start_offset: Optional[int] = None,
    end_offset: Optional[int] = None,
) -> MaterialAnnotation:
    """创建批注高亮"""
    annotation = MaterialAnnotation(
        material_id=material_id,
        user_id=user_id,
        selected_text=selected_text,
        note=note,
        color=color,
        start_offset=start_offset,
        end_offset=end_offset,
    )
    db.add(annotation)
    await db.flush()
    await db.refresh(annotation)
    return annotation

async def get_annotations_by_material(
    db: AsyncSession,
    material_id: int,
    user_id: int,
) -> List[MaterialAnnotation]:
    """获取资料的所有批注"""
    result = await db.execute(
        select(MaterialAnnotation)
        .where(
            MaterialAnnotation.material_id == material_id,
            MaterialAnnotation.user_id == user_id,
        )
        .order_by(MaterialAnnotation.created_at.asc())
    )
    return list(result.scalars().all())

async def delete_annotation(
    db: AsyncSession,
    annotation_id: int,
    user_id: int,
) -> bool:
    """删除批注"""
    result = await db.execute(
        select(MaterialAnnotation)
        .where(
            MaterialAnnotation.id == annotation_id,
            MaterialAnnotation.user_id == user_id,
        )
    )
    anno = result.scalar_one_or_none()
    if anno:
        await db.delete(anno)
        await db.flush()
        return True
    return False
