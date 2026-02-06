"""
内容过滤服务 - 检测和过滤敏感内容
"""
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud

# 过滤后显示的消息
RESTRICTED_MESSAGE = "受地区限制，部分内容无法显示。"


class ContentFilterService:
    """内容过滤服务类"""
    
    # 缓存的关键词列表
    _cached_keywords: list[str] = []
    _cache_valid: bool = False
    
    @classmethod
    def invalidate_cache(cls):
        """使缓存失效"""
        cls._cache_valid = False
    
    @classmethod
    async def refresh_keywords(cls, db: AsyncSession):
        """刷新关键词缓存"""
        cls._cached_keywords = await crud.get_active_keywords(db)
        cls._cache_valid = True
        print(f"[ContentFilter] 已刷新限制词缓存: {len(cls._cached_keywords)} 个词")
    
    @classmethod
    async def get_keywords(cls, db: AsyncSession) -> list[str]:
        """获取关键词列表（带缓存）"""
        if not cls._cache_valid:
            await cls.refresh_keywords(db)
        return cls._cached_keywords
    
    @classmethod
    async def check_content(
        cls,
        db: AsyncSession,
        content: str
    ) -> Tuple[bool, Optional[str]]:
        """
        检查内容是否包含限制词
        
        Args:
            db: 数据库会话
            content: 要检查的内容
        
        Returns:
            Tuple[bool, Optional[str]]: (是否通过, 匹配到的关键词)
        """
        keywords = await cls.get_keywords(db)
        
        if not keywords:
            return True, None
        
        content_lower = content.lower()
        for keyword in keywords:
            if keyword.lower() in content_lower:
                print(f"[ContentFilter] 检测到限制词: '{keyword}'")
                return False, keyword
        
        return True, None
    
    @classmethod
    async def filter_input(
        cls,
        db: AsyncSession,
        content: str
    ) -> Tuple[bool, str]:
        """
        过滤用户输入
        
        Args:
            db: 数据库会话
            content: 用户输入内容
        
        Returns:
            Tuple[bool, str]: (是否通过, 处理后的内容或限制消息)
        """
        passed, matched_keyword = await cls.check_content(db, content)
        
        if not passed:
            return False, RESTRICTED_MESSAGE
        
        return True, content
    
    @classmethod
    async def filter_output(
        cls,
        db: AsyncSession,
        content: str
    ) -> str:
        """
        过滤 AI 输出
        
        Args:
            db: 数据库会话
            content: AI 输出内容
        
        Returns:
            str: 处理后的内容（如果包含限制词则返回限制消息）
        """
        passed, matched_keyword = await cls.check_content(db, content)
        
        if not passed:
            return RESTRICTED_MESSAGE
        
        return content


# 创建全局实例
content_filter = ContentFilterService()
