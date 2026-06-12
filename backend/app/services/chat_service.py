"""
对话业务服务 - 处理对话相关的业务逻辑（支持智能体工具调用）
"""

import logging
import re
from collections.abc import AsyncGenerator
from typing import List, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db import crud
from ..db.models import ChatSession, Message
from .ai_service import ai_service
from .content_filter import RESTRICTED_MESSAGE, content_filter
from .learn_service import hybrid_retrieve_chunks
from .tools.code_interpreter import TOOL_DEFINITION as CODE_INTERPRETER_TOOL
from .tools.code_interpreter import execute_python_code

# 导入工具定义
from .tools.web_search import TOOL_DEFINITION as WEB_SEARCH_TOOL
from .tools.web_search import search_web

logger = logging.getLogger(__name__)

# 注册所有可用工具
AVAILABLE_TOOLS = [WEB_SEARCH_TOOL, CODE_INTERPRETER_TOOL]
TOOL_EXECUTORS = {"search_web": search_web, "execute_python_code": execute_python_code}


class ChatService:
    """对话业务服务类"""

    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)

    async def close(self):
        """关闭HTTP连接"""
        await self.http_client.aclose()

    async def expand_doc_content(self, content: str) -> str:
        """
        展开消息中的文档标记，从 upword 服务获取文档内容
        """
        pattern = r"<!-- DOC:(.+?):(.+?) --><!-- /DOC -->"
        matches = list(re.finditer(pattern, content))
        if not matches:
            return content

        for match in matches:
            filename = match.group(1)
            doc_key = match.group(2)
            try:
                response = await self.http_client.get(f"{settings.UPWORD_INTERNAL_URL}/api/v1/documents/{doc_key}/raw")
                if response.status_code == 200:
                    doc_content = response.text
                    expanded = f"<!-- DOC:{filename} -->\n{doc_content}\n<!-- /DOC -->"
                    content = content.replace(match.group(0), expanded)
            except Exception as e:
                logger.warning(f"获取文档异常: {filename} ({e})")
        return content

    async def get_or_create_session(
        self, db: AsyncSession, user_id: int, session_id: Optional[int] = None
    ) -> ChatSession:
        if session_id:
            session = await crud.get_session_by_id(db, session_id, user_id)
            if session:
                return session
        return await crud.create_session(db, user_id)

    async def get_sessions(self, db: AsyncSession, user_id: int, skip: int = 0, limit: int = 50) -> List[ChatSession]:
        return await crud.get_user_sessions(db, user_id, skip=skip, limit=limit)

    async def get_session_messages(self, db: AsyncSession, session_id: int, user_id: int) -> List[Message]:
        session = await crud.get_session_by_id(db, session_id, user_id)
        if not session:
            raise ValueError("会话不存在")
        return await crud.get_session_messages(db, session_id)

    async def delete_session(self, db: AsyncSession, session_id: int, user_id: int) -> bool:
        session = await crud.get_session_by_id(db, session_id, user_id)
        if not session:
            return False
        await crud.delete_session(db, session_id)
        return True

    async def clear_session_messages(self, db: AsyncSession, session_id: int, user_id: int) -> bool:
        session = await crud.get_session_by_id(db, session_id, user_id)
        if not session:
            return False
        await crud.clear_session_messages(db, session_id)
        return True

    async def send_message_stream(
        self,
        db: AsyncSession,
        session_id: int,
        user_id: int,
        content: str,
        model: Optional[str] = None,
        thinking_enabled: bool = True,
    ) -> AsyncGenerator[dict, None]:
        """发送消息并获取流式响应（支持 Agent 工具调用链）"""
        session = await crud.get_session_by_id(db, session_id, user_id)
        if not session:
            yield {"type": "error", "data": "会话不存在"}
            return

        user = await crud.get_user_by_id(db, user_id)
        if not user:
            yield {"type": "error", "data": "用户不存在"}
            return

        if content_filter.is_restricted(content):
            yield {"type": "error", "data": RESTRICTED_MESSAGE}
            return

        await crud.create_message(db, session_id, "user", content)
        await db.commit()

        history = await crud.get_session_messages(db, session_id)
        messages = []
        for msg in history[-10:]:
            msg_content = msg.content
            if msg.role == "user":
                msg_content = await self.expand_doc_content(msg_content)
            messages.append({"role": msg.role, "content": msg_content})

        max_tokens = settings.AI_MAX_TOKENS
        temperature = settings.AI_TEMPERATURE

        # RAG 流程：混合检索
        retrieved_chunks = await hybrid_retrieve_chunks(user.id, content, [], top_k=5)
        system_prompt = None
        if retrieved_chunks:
            context_text = "\n".join(
                [f"- {chunk.content if hasattr(chunk, 'content') else chunk}" for chunk, score in retrieved_chunks]
            )
            system_prompt = f"""你是墨语（Mochat）的AI助手，具备联网搜索与代码沙箱执行能力。
以下是从用户私有知识库中检索到的参考资料，请优先基于这些资料回答。
如果资料中没有相关信息，请使用 search_web 工具在互联网上搜索后回答。
如果需要进行数学计算、数据分析或绘制图表，请使用 execute_python_code 工具。
如果问题涉及最新新闻、实时天气、股价等动态信息，请务必使用工具搜索。

【参考资料】
{context_text}"""
        else:
            system_prompt = "你是墨语（Mochat）的AI助手，具备联网搜索与代码沙箱执行能力。如果用户的问题超出了你的知识范围，或涉及最新新闻、实时信息，请使用 search_web 工具进行搜索；若涉及数学计算、数据分析或生成图表，请使用 execute_python_code 工具。"

        # 工具调用循环（最多 3 轮）
        max_tool_rounds = 3
        for round_num in range(max_tool_rounds):
            tool_calls_buffer = {}
            thinking_full = ""
            content_full = ""

            async for chunk in ai_service.chat_stream(
                messages,
                system_prompt=system_prompt,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                tools=AVAILABLE_TOOLS,
            ):
                if chunk["type"] == "thinking":
                    thinking_full += chunk["data"]
                    yield chunk
                elif chunk["type"] == "content":
                    content_full += chunk["data"]
                    yield chunk
                elif chunk["type"] == "tool_calls":
                    try:
                        import json

                        tool_calls_list = json.loads(chunk["data"])
                        for tc in tool_calls_list:
                            tool_calls_buffer[tc["id"]] = tc
                    except Exception as e:
                        logger.error(f"解析工具调用失败: {e}")
                elif chunk["type"] == "error":
                    yield chunk
                    return

            if not tool_calls_buffer:
                # 没有工具调用，对话结束
                if content_full and not content_filter.is_restricted(content_full):
                    await crud.create_message(
                        db, session_id, "assistant", content_full, thinking=thinking_full if thinking_full else None
                    )
                    await db.commit()
                elif content_filter.is_restricted(content_full):
                    yield {"type": "error", "data": RESTRICTED_MESSAGE}
                return

            # 执行工具调用
            # 1. 将 Assistant 的回复（包含工具调用意图）加入历史
            assistant_msg = {
                "role": "assistant",
                "content": content_full or None,
                "tool_calls": [
                    {"id": tc["id"], "type": "function", "function": tc["function"]}
                    for tc in tool_calls_buffer.values()
                ],
            }
            messages.append(assistant_msg)

            # 2. 逐个执行工具并加入历史
            for tc_id, tc in tool_calls_buffer.items():
                func_name = tc["function"]["name"]
                try:
                    import json

                    args = json.loads(tc["function"]["arguments"])
                except Exception:
                    args = {}

                yield {"type": "tool_status", "data": f"正在执行工具: {func_name}({args})..."}

                if func_name in TOOL_EXECUTORS:
                    try:
                        result = TOOL_EXECUTORS[func_name](**args)
                        import json

                        tool_result_str = json.dumps(result, ensure_ascii=False)
                    except Exception as e:
                        tool_result_str = f"工具执行出错: {str(e)}"
                else:
                    tool_result_str = f"未知工具: {func_name}"

                messages.append({"role": "tool", "tool_call_id": tc_id, "content": tool_result_str})

            # 继续下一轮循环让 AI 根据工具结果生成最终回复

        # 超过最大工具调用轮数
        yield {"type": "error", "data": "工具调用次数过多，请简化您的请求。"}


# 创建全局实例
chat_service = ChatService()
