"""
内容过滤服务 - 检测和过滤敏感内容
"""
import logging
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud

logger = logging.getLogger(__name__)

# 过滤后显示的消息
RESTRICTED_MESSAGE = "受地区限制，部分内容无法显示。"


class ContentFilterService:
    """内容过滤服务类"""

    def __init__(self):
        self._cached_keywords: list[str] = []
        self._cache_valid: bool = False

    def invalidate_cache(self):
        """使缓存失效"""
        self._cache_valid = False

    async def refresh_keywords(self, db: AsyncSession):
        """刷新关键词缓存"""
        self._cached_keywords = await crud.get_active_keywords(db)
        self._cache_valid = True
        logger.info("已刷新限制词缓存: %d 个词", len(self._cached_keywords))

    async def get_keywords(self, db: AsyncSession) -> list[str]:
        """获取关键词列表（带缓存）"""
        if not self._cache_valid:
            await self.refresh_keywords(db)
        return self._cached_keywords

    async def check_content(
        self,
        db: AsyncSession,
        content: str,
    ) -> Tuple[bool, Optional[str]]:
        """
        检查内容是否包含限制词

        Returns:
            Tuple[bool, Optional[str]]: (是否通过, 匹配到的关键词)
        """
        keywords = await self.get_keywords(db)

        if not keywords:
            return True, None

        content_lower = content.lower()
        for keyword in keywords:
            if keyword.lower() in content_lower:
                logger.info("检测到限制词: '%s'", keyword)
                return False, keyword

        return True, None

    async def filter_input(
        self,
        db: AsyncSession,
        content: str,
    ) -> Tuple[bool, str]:
        """
        过滤用户输入

        Returns:
            Tuple[bool, str]: (是否通过, 处理后的内容或限制消息)
        """
        passed, _ = await self.check_content(db, content)
        if not passed:
            return False, RESTRICTED_MESSAGE
        return True, content

    async def filter_output(
        self,
        db: AsyncSession,
        content: str,
    ) -> str:
        """
        过滤 AI 输出

        Returns:
            str: 处理后的内容（如果包含限制词则返回限制消息）
        """
        passed, _ = await self.check_content(db, content)
        if not passed:
            return RESTRICTED_MESSAGE
        return content


# 创建全局单例
content_filter = ContentFilterService()
