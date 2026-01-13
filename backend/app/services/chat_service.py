"""
对话业务服务 - 处理对话相关的业务逻辑
"""
from typing import List, Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import ChatSession, Message, User
from .ai_service import ai_service
from .content_filter import content_filter, RESTRICTED_MESSAGE


class ChatService:
    """对话业务服务类"""
    
    @staticmethod
    async def create_session(
        db: AsyncSession,
        user: User,
        title: str = "新对话"
    ) -> ChatSession:
        """创建新会话"""
        return await crud.create_session(db, user.id, title)
    
    @staticmethod
    async def get_user_sessions(
        db: AsyncSession,
        user: User,
        skip: int = 0,
        limit: int = 50
    ) -> List[ChatSession]:
        """获取用户的会话列表"""
        return await crud.get_user_sessions(db, user.id, skip, limit)
    
    @staticmethod
    async def get_session(
        db: AsyncSession,
        session_id: int,
        user: User
    ) -> Optional[ChatSession]:
        """获取会话（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if session and session.user_id == user.id:
            return session
        return None
    
    @staticmethod
    async def delete_session(
        db: AsyncSession,
        session_id: int,
        user: User
    ) -> bool:
        """删除会话（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if session and session.user_id == user.id:
            return await crud.delete_session(db, session_id)
        return False
    
    @staticmethod
    async def get_session_messages(
        db: AsyncSession,
        session_id: int,
        user: User
    ) -> Optional[List[Message]]:
        """获取会话消息（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if not session or session.user_id != user.id:
            return None
        return await crud.get_session_messages(db, session_id)
    
    @staticmethod
    async def send_message_stream(
        db: AsyncSession,
        session_id: int,
        user: User,
        content: str
    ) -> AsyncGenerator[dict, None]:
        """
        发送消息并获取AI流式响应
        
        Yields:
            dict: {"type": "thinking" | "content" | "done" | "error", "data": str}
        """
        # 验证会话所有权
        session = await crud.get_session_by_id(db, session_id)
        if not session or session.user_id != user.id:
            yield {"type": "error", "data": "会话不存在或无权访问"}
            return
        
        # 检查用户输入是否包含限制词
        input_passed, filtered_input = await content_filter.filter_input(db, content)
        if not input_passed:
            # 保存用户原始消息
            await crud.create_message(db, session_id, "user", content)
            await db.commit()
            # 返回限制消息
            yield {"type": "content", "data": RESTRICTED_MESSAGE}
            yield {"type": "done", "data": ""}
            # 保存限制消息作为 AI 响应
            await crud.create_message(db, session_id, "assistant", RESTRICTED_MESSAGE)
            await db.commit()
            return
        
        # 保存用户消息
        await crud.create_message(db, session_id, "user", content)
        await db.commit()
        
        # 获取历史消息构建上下文
        history = await crud.get_session_messages(db, session_id)
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in history[-10:]  # 最近10条消息作为上下文
        ]
        
        # 调用AI服务获取流式响应
        thinking_full = ""
        content_full = ""
        output_restricted = False
        
        async for chunk in ai_service.chat_stream(messages):
            if chunk["type"] == "thinking":
                thinking_full += chunk["data"]
                yield chunk
            elif chunk["type"] == "content":
                content_full += chunk["data"]
                # 实时检查输出内容
                output_passed, _ = await content_filter.check_content(db, content_full)
                if not output_passed:
                    output_restricted = True
                    break
                yield chunk
            else:
                yield chunk
        
        # 如果输出被限制
        if output_restricted:
            yield {"type": "content", "data": f"\n\n{RESTRICTED_MESSAGE}"}
            yield {"type": "done", "data": ""}
            # 保存限制消息
            await crud.create_message(
                db, 
                session_id, 
                "assistant", 
                RESTRICTED_MESSAGE,
                thinking=thinking_full if thinking_full else None
            )
            await db.commit()
            return
        
        # 保存AI响应
        if content_full:
            await crud.create_message(
                db, 
                session_id, 
                "assistant", 
                content_full,
                thinking=thinking_full if thinking_full else None
            )
            
            # 如果是第一条消息，更新会话标题
            if len(history) <= 1:
                title = await ai_service.generate_title(content)
                await crud.update_session(db, session_id, title=title)
            
            await db.commit()
    
    @staticmethod
    async def regenerate_response(
        db: AsyncSession,
        session_id: int,
        user: User
    ) -> AsyncGenerator[dict, None]:
        """重新生成最后一条AI响应"""
        # 验证会话所有权
        session = await crud.get_session_by_id(db, session_id)
        if not session or session.user_id != user.id:
            yield {"type": "error", "data": "会话不存在或无权访问"}
            return
        
        # 获取历史消息
        history = await crud.get_session_messages(db, session_id)
        if not history:
            yield {"type": "error", "data": "没有消息可以重新生成"}
            return
        
        # 找到最后一条用户消息
        messages = []
        for msg in history:
            if msg.role == "user":
                messages.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant" and messages:
                messages.append({"role": "assistant", "content": msg.content})
        
        if not messages or messages[-1]["role"] != "user":
            # 移除最后一条assistant消息，重新生成
            messages = messages[:-1] if messages else []
        
        if not messages:
            yield {"type": "error", "data": "没有用户消息"}
            return
        
        # 调用AI服务
        thinking_full = ""
        content_full = ""
        
        async for chunk in ai_service.chat_stream(messages):
            if chunk["type"] == "thinking":
                thinking_full += chunk["data"]
            elif chunk["type"] == "content":
                content_full += chunk["data"]
            yield chunk
        
        # 保存新的AI响应
        if content_full:
            await crud.create_message(
                db,
                session_id,
                "assistant",
                content_full,
                thinking=thinking_full if thinking_full else None
            )
            await db.commit()


# 创建全局实例
chat_service = ChatService()
