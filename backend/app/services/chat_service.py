"""
对话业务服务 - 处理对话相关的业务逻辑
"""

import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import List, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db import crud
from ..db.models import ChatSession, Message, User
from .ai_service import ai_service
from .content_filter import RESTRICTED_MESSAGE, content_filter
from .knowledge_service import knowledge_service
from .tools.code_interpreter import TOOL_DEFINITION as CODE_INTERPRETER_TOOL
from .tools.code_interpreter import execute_python_code
from .tools.web_search import TOOL_DEFINITION as WEB_SEARCH_TOOL
from .tools.web_search import search_web

logger = logging.getLogger(__name__)

# 注册可用工具
AVAILABLE_TOOLS = [WEB_SEARCH_TOOL, CODE_INTERPRETER_TOOL]
TOOL_EXECUTORS = {
    "search_web": search_web,
    "execute_python_code": execute_python_code,
}


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

        格式: <!-- DOC:filename:key --><!-- /DOC -->
        展开为: <!-- DOC:filename -->文档内容<!-- /DOC -->
        """
        # 匹配格式: <!-- DOC:filename:key --><!-- /DOC -->
        pattern = r"<!-- DOC:(.+?):(.+?) --><!-- /DOC -->"
        matches = list(re.finditer(pattern, content))

        if not matches:
            return content

        result = content
        for match in matches:
            filename = match.group(1)
            object_key = match.group(2)

            try:
                # 调用 upword 服务获取文档内容
                response = await self.http_client.post(
                    f"{settings.UPWORD_INTERNAL_URL}/api/parse", json={"objectKey": object_key}
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("success") and data.get("markdown"):
                        # 替换为包含内容的格式
                        doc_content = (
                            f"<!-- DOC:{filename} -->\n以下是用户上传的文档内容:\n\n{data['markdown']}\n<!-- /DOC -->"
                        )
                        result = result.replace(match.group(0), doc_content)
                        logger.info("成功获取文档内容: %s", filename)
                    else:
                        logger.warning("文档解析失败: %s", data.get("error"))
                else:
                    logger.warning("upword 服务响应错误: %s", response.status_code)
            except Exception as e:
                logger.error("获取文档内容失败: %s", e)

        return result

    async def create_session(self, db: AsyncSession, user: User, title: str = "新对话") -> ChatSession:
        """创建新会话"""
        return await crud.create_session(db, user.id, title)

    async def get_user_sessions(
        self, db: AsyncSession, user: User, skip: int = 0, limit: int = 50
    ) -> List[ChatSession]:
        """获取用户的会话列表"""
        return await crud.get_user_sessions(db, user.id, skip, limit)

    async def get_session(self, db: AsyncSession, session_id: int, user: User) -> Optional[ChatSession]:
        """获取会话（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if session and session.user_id == user.id:
            return session
        return None

    async def delete_session(self, db: AsyncSession, session_id: int, user: User) -> bool:
        """删除会话（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if session and session.user_id == user.id:
            return await crud.delete_session(db, session_id)
        return False

    async def get_session_messages(self, db: AsyncSession, session_id: int, user: User) -> Optional[List[Message]]:
        """获取会话消息（验证所有权）"""
        session = await crud.get_session_by_id(db, session_id)
        if not session or session.user_id != user.id:
            return None
        return await crud.get_session_messages(db, session_id)

    async def get_session_messages_paginated(
        self, db: AsyncSession, session_id: int, user: User, limit: int = 10, before_id: int = None
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

        messages, has_more = await crud.get_session_messages_paginated(db, session_id, limit, before_id)
        total = await crud.get_session_message_count(db, session_id)

        return {"messages": messages, "has_more": has_more, "total": total}

    async def send_message_stream(
        self, db: AsyncSession, session_id: int, user: User, content: str, model: Optional[str] = None
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
                msg_content = await self.expand_doc_content(msg_content)
            messages.append({"role": msg.role, "content": msg_content})

        # 使用环境变量配置（避免数据库查询延迟）
        max_tokens = settings.AI_MAX_TOKENS
        temperature = settings.AI_TEMPERATURE

        # RAG 流程：在发送给 AI 之前，先在用户私有知识库中进行语义检索
        retrieved_chunks = await knowledge_service.search_knowledge(user.id, content)
        system_prompt = None
        if retrieved_chunks:
            context_text = "\n".join([f"- {chunk}" for chunk in retrieved_chunks])
            system_prompt = f"""你是墨语（Mochat）的AI助手。
以下是从用户私有知识库中检索到的参考资料，请优先基于这些资料回答用户的问题。如果资料中没有相关信息，请基于你的通用知识进行回答。

【参考资料】
{context_text}

请用友好、专业的方式回答用户问题，并确保在回答中如果引用了资料，请明确标注。"""

        # 工具调用循环（最多 3 轮）
        max_tool_rounds = 3
        thinking_full = ""
        content_full = ""
        output_restricted = False

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
                tools=AVAILABLE_TOOLS if round_num == 0 else None,
            ):
                if chunk["type"] == "thinking":
                    thinking_full += chunk["data"]
                    yield chunk
                elif chunk["type"] == "content":
                    content_full += chunk["data"]
                    yield chunk
                elif chunk["type"] == "tool_calls":
                    try:
                        tool_calls_list = json.loads(chunk["data"])
                        for tc in tool_calls_list:
                            tool_calls_buffer[tc["id"]] = tc
                    except Exception as e:
                        logger.error(f"解析工具调用失败: {e}")
                elif chunk["type"] == "error":
                    yield chunk
                    return

            if not tool_calls_buffer:
                break

            # 有工具调用：将 Assistant 回复加入历史
            assistant_msg = {
                "role": "assistant",
                "content": content_full or None,
                "tool_calls": [
                    {"id": tc["id"], "type": "function", "function": tc["function"]}
                    for tc in tool_calls_buffer.values()
                ],
            }
            messages.append(assistant_msg)

            # 逐个执行工具
            for tc_id, tc in tool_calls_buffer.items():
                func_name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"])
                except Exception:
                    args = {}

                yield {"type": "tool_status", "data": f"正在执行工具: {func_name}..."}

                if func_name in TOOL_EXECUTORS:
                    try:
                        result = TOOL_EXECUTORS[func_name](**args)
                        tool_result_str = json.dumps(result, ensure_ascii=False)

                        # 截断过长的工具结果，防止撑爆上下文
                        MAX_TOOL_RESULT = 6000
                        if len(tool_result_str) > MAX_TOOL_RESULT:
                            tool_result_str = (
                                tool_result_str[:MAX_TOOL_RESULT]
                                + f"\n... [结果被截断，共 {len(tool_result_str)} 字符]"
                            )
                    except TypeError as e:
                        # 参数不匹配：帮助 AI 理解正确用法
                        tool_result_str = f"工具参数错误: {str(e)}。请检查参数名称和类型后重试。"
                        logger.warning(f"工具 {func_name} 参数错误: {e}")
                    except Exception as e:
                        tool_result_str = f"工具执行出错: {str(e)}。请基于已有信息回答用户。"
                        logger.error(f"工具 {func_name} 执行失败: {e}")
                else:
                    tool_result_str = f"未知工具: {func_name}。可用工具: {list(TOOL_EXECUTORS.keys())}"
            yield {"type": "error", "data": "工具调用次数过多，请简化您的请求。"}
            return

        # 流结束后再检查内容（不影响流式输出）
        if content_full:
            output_passed, _ = await content_filter.check_content(db, content_full)
            if not output_passed:
                output_restricted = True

        # 如果输出被限制
        if output_restricted:
            yield {"type": "content", "data": f"\n\n{RESTRICTED_MESSAGE}"}
            yield {"type": "done", "data": ""}
            await crud.create_message(
                db, session_id, "assistant", RESTRICTED_MESSAGE, thinking=thinking_full if thinking_full else None
            )
            await db.commit()
            return

        # 保存AI响应
        if content_full:
            await crud.create_message(
                db, session_id, "assistant", content_full, thinking=thinking_full if thinking_full else None
            )
            if len(history) <= 1:
                title = await ai_service.generate_title(content)
                await crud.update_session(db, session_id, title=title)
            await db.commit()
        else:
            yield {"type": "error", "data": "AI 未返回有效内容"}

    async def regenerate_response(self, db: AsyncSession, session_id: int, user: User) -> AsyncGenerator[dict, None]:
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

        async for chunk in ai_service.chat_stream(messages, max_tokens=max_tokens, temperature=temperature):
            if chunk["type"] == "thinking":
                thinking_full += chunk["data"]
            elif chunk["type"] == "content":
                content_full += chunk["data"]
            yield chunk

        # 保存新的AI响应
        if content_full:
            await crud.create_message(
                db, session_id, "assistant", content_full, thinking=thinking_full if thinking_full else None
            )
            await db.commit()


# 创建全局实例
chat_service = ChatService()
