"""
对话业务服务 - 处理对话相关的业务逻辑
"""
import re
import httpx
from typing import List, Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import ChatSession, Message, User
from .ai_service import ai_service
from .content_filter import content_filter, RESTRICTED_MESSAGE
from ..core.config import settings

# Upword 服务地址（Docker 内部网络）
UPWORD_SERVICE_URL = "http://upword:3901"


class ChatService:
    """对话业务服务类"""
    
    @staticmethod
    async def expand_doc_content(content: str) -> str:
        """
        展开消息中的文档标记，从 upword 服务获取文档内容
        
        格式: <!-- DOC:filename:key --><!-- /DOC -->
        展开为: <!-- DOC:filename -->文档内容<!-- /DOC -->
        """
        # 匹配格式: <!-- DOC:filename:key --><!-- /DOC -->
        pattern = r'<!-- DOC:(.+?):(.+?) --><!-- /DOC -->'
        matches = list(re.finditer(pattern, content))
        
        if not matches:
            return content
        
        result = content
        for match in matches:
            filename = match.group(1)
            object_key = match.group(2)
            
            try:
                # 调用 upword 服务获取文档内容
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        f"{UPWORD_SERVICE_URL}/api/parse",
                        json={"objectKey": object_key}
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get("success") and data.get("markdown"):
                            # 替换为包含内容的格式
                            doc_content = f"<!-- DOC:{filename} -->\n以下是用户上传的文档内容:\n\n{data['markdown']}\n<!-- /DOC -->"
                            result = result.replace(match.group(0), doc_content)
                            print(f"[ChatService] 成功获取文档内容: {filename}")
                        else:
                            print(f"[ChatService] 文档解析失败: {data.get('error')}")
                    else:
                        print(f"[ChatService] upword 服务响应错误: {response.status_code}")
            except Exception as e:
                print(f"[ChatService] 获取文档内容失败: {e}")
        
        return result
    
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
    async def get_session_messages_paginated(
        db: AsyncSession,
        session_id: int,
        user: User,
        limit: int = 10,
        before_id: int = None
    ) -> Optional[dict]:
        """
        分页获取会话消息（验证所有权）
        
        Returns:
            {
                "messages": [...],
                "has_more": bool,
                "total": int
            }
        """
        session = await crud.get_session_by_id(db, session_id)
        if not session or session.user_id != user.id:
            return None
        
        messages, has_more = await crud.get_session_messages_paginated(
            db, session_id, limit, before_id
        )
        total = await crud.get_session_message_count(db, session_id)
        
        return {
            "messages": messages,
            "has_more": has_more,
            "total": total
        }
    
    @staticmethod
    async def send_message_stream(
        db: AsyncSession,
        session_id: int,
        user: User,
        content: str,
        model: Optional[str] = None
    ) -> AsyncGenerator[dict, None]:
        """
        发送消息并获取AI流式响应
        
        Args:
            model: 可选的模型名称，不传则使用默认模型
        
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
        
        # 保存用户消息（保存原始内容，不含文档实际内容）
        await crud.create_message(db, session_id, "user", content)
        await db.commit()
        
        # 获取历史消息构建上下文
        history = await crud.get_session_messages(db, session_id)
        messages = []
        for msg in history[-10:]:  # 最近10条消息作为上下文
            msg_content = msg.content
            # 对于用户消息，展开文档标记获取实际内容
            if msg.role == "user":
                msg_content = await ChatService.expand_doc_content(msg_content)
            messages.append({"role": msg.role, "content": msg_content})
        
        # 使用环境变量配置（避免数据库查询延迟）
        max_tokens = settings.AI_MAX_TOKENS
        temperature = settings.AI_TEMPERATURE
        
        # 调用AI服务获取流式响应
        thinking_full = ""
        content_full = ""
        output_restricted = False
        
        async for chunk in ai_service.chat_stream(
            messages, 
            model=model,
            max_tokens=max_tokens,
            temperature=temperature
        ):
            if chunk["type"] == "thinking":
                thinking_full += chunk["data"]
                yield chunk  # 立即推送，不阻塞
            elif chunk["type"] == "content":
                content_full += chunk["data"]
                yield chunk  # 立即推送，不做任何阻塞检查
            else:
                yield chunk
        
        # 流结束后再检查内容（不影响流式输出）
        if content_full:
            output_passed, _ = await content_filter.check_content(db, content_full)
            if not output_passed:
                output_restricted = True
        
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
        
        # 使用环境变量配置
        max_tokens = settings.AI_MAX_TOKENS
        temperature = settings.AI_TEMPERATURE
        
        # 调用AI服务
        thinking_full = ""
        content_full = ""
        
        async for chunk in ai_service.chat_stream(
            messages,
            max_tokens=max_tokens,
            temperature=temperature
        ):
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
