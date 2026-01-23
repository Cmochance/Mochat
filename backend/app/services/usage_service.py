"""
用户使用量服务 - 管理用户的对话和生图配额
"""
from datetime import date
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models import User, UserUsage


# 用户等级配额配置
TIER_LIMITS = {
    "free": {
        "chat_limit": 50,
        "image_limit": 2,
        "name_zh": "普通用户",
        "name_en": "Free User"
    },
    "pro": {
        "chat_limit": 200,
        "image_limit": 5,
        "name_zh": "高级用户",
        "name_en": "Pro User"
    },
    "plus": {
        "chat_limit": 500,
        "image_limit": 10,
        "name_zh": "超级用户",
        "name_en": "Plus User"
    },
    "admin": {
        "chat_limit": -1,  # -1 表示无限制
        "image_limit": -1,
        "name_zh": "管理员",
        "name_en": "Admin"
    }
}


class UsageService:
    """使用量服务"""
    
    def get_tier_limits(self, tier: str) -> Dict[str, Any]:
        """获取指定等级的配额限制"""
        return TIER_LIMITS.get(tier, TIER_LIMITS["free"])
    
    async def get_or_create_usage(self, db: AsyncSession, user_id: int) -> UserUsage:
        """获取或创建用户使用量记录"""
        result = await db.execute(
            select(UserUsage).where(UserUsage.user_id == user_id)
        )
        usage = result.scalar_one_or_none()
        
        if not usage:
            usage = UserUsage(user_id=user_id, reset_date=date.today())
            db.add(usage)
            await db.flush()
            await db.refresh(usage)
        
        return usage
    
    async def check_and_reset_daily(self, db: AsyncSession, usage: UserUsage) -> UserUsage:
        """检查是否需要重置每日使用量"""
        today = date.today()
        if usage.reset_date < today:
            usage.chat_count = 0
            usage.image_count = 0
            usage.reset_date = today
            await db.flush()
            await db.refresh(usage)
        return usage
    
    async def get_user_usage_info(self, db: AsyncSession, user: User) -> Dict[str, Any]:
        """获取用户的完整使用量信息"""
        # 管理员无限制
        if user.role == "admin":
            tier_info = self.get_tier_limits("admin")
            return {
                "tier": "admin",
                "tier_name_zh": tier_info["name_zh"],
                "tier_name_en": tier_info["name_en"],
                "chat_limit": -1,
                "chat_used": 0,
                "chat_remaining": -1,
                "image_limit": -1,
                "image_used": 0,
                "image_remaining": -1,
                "is_unlimited": True,
                "reset_date": None
            }
        
        # 获取用户使用量记录
        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)
        
        # 获取等级配额
        tier = user.tier or "free"
        tier_info = self.get_tier_limits(tier)
        chat_limit = tier_info["chat_limit"]
        image_limit = tier_info["image_limit"]
        
        return {
            "tier": tier,
            "tier_name_zh": tier_info["name_zh"],
            "tier_name_en": tier_info["name_en"],
            "chat_limit": chat_limit,
            "chat_used": usage.chat_count,
            "chat_remaining": chat_limit - usage.chat_count,
            "image_limit": image_limit,
            "image_used": usage.image_count,
            "image_remaining": image_limit - usage.image_count,
            "is_unlimited": False,
            "reset_date": usage.reset_date.isoformat() if usage.reset_date else None
        }
    
    async def check_chat_limit(self, db: AsyncSession, user: User) -> tuple[bool, str]:
        """
        检查用户是否可以发送对话请求
        
        Returns:
            (可以发送, 错误消息)
        """
        # 管理员无限制
        if user.role == "admin":
            return True, ""
        
        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)
        
        tier = user.tier or "free"
        tier_info = self.get_tier_limits(tier)
        chat_limit = tier_info["chat_limit"]
        
        if usage.chat_count >= chat_limit:
            return False, f"今日对话次数已用完（{chat_limit}/{chat_limit}），请明天再试或升级账户"
        
        return True, ""
    
    async def check_image_limit(self, db: AsyncSession, user: User) -> tuple[bool, str]:
        """
        检查用户是否可以发送生图请求
        
        Returns:
            (可以发送, 错误消息)
        """
        # 管理员无限制
        if user.role == "admin":
            return True, ""
        
        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)
        
        tier = user.tier or "free"
        tier_info = self.get_tier_limits(tier)
        image_limit = tier_info["image_limit"]
        
        if usage.image_count >= image_limit:
            return False, f"今日生图次数已用完（{image_limit}/{image_limit}），请明天再试或升级账户"
        
        return True, ""
    
    async def increment_chat_count(self, db: AsyncSession, user: User) -> None:
        """增加对话计数"""
        if user.role == "admin":
            return
        
        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)
        usage.chat_count += 1
        await db.flush()
    
    async def increment_image_count(self, db: AsyncSession, user: User) -> None:
        """增加生图计数"""
        if user.role == "admin":
            return
        
        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)
        usage.image_count += 1
        await db.flush()
    
    async def get_all_usage_stats(self, db: AsyncSession) -> list[Dict[str, Any]]:
        """获取所有用户的使用量统计（管理员用）"""
        result = await db.execute(
            select(User, UserUsage)
            .outerjoin(UserUsage, User.id == UserUsage.user_id)
            .order_by(User.created_at.desc())
        )
        
        stats = []
        today = date.today()
        
        for row in result.fetchall():
            user = row[0]
            usage = row[1]
            
            # 如果是管理员，显示特殊信息
            if user.role == "admin":
                tier_info = self.get_tier_limits("admin")
                stats.append({
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "tier": "admin",
                    "tier_name_zh": tier_info["name_zh"],
                    "tier_name_en": tier_info["name_en"],
                    "chat_limit": -1,
                    "chat_used": 0,
                    "image_limit": -1,
                    "image_used": 0,
                    "is_unlimited": True
                })
            else:
                tier = user.tier or "free"
                tier_info = self.get_tier_limits(tier)
                
                # 检查是否需要重置（只读检查，不修改）
                chat_count = 0
                image_count = 0
                if usage:
                    if usage.reset_date >= today:
                        chat_count = usage.chat_count
                        image_count = usage.image_count
                
                stats.append({
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "tier": tier,
                    "tier_name_zh": tier_info["name_zh"],
                    "tier_name_en": tier_info["name_en"],
                    "chat_limit": tier_info["chat_limit"],
                    "chat_used": chat_count,
                    "image_limit": tier_info["image_limit"],
                    "image_used": image_count,
                    "is_unlimited": False
                })
        
        return stats


# 单例
usage_service = UsageService()
