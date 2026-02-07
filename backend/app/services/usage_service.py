"""
用户使用量服务 - 管理用户配额、事件统计和管理员查询
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Dict, Any
import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UsageDailyAggregate, UsageEvent, User, UserUsage


# 用户等级配额配置
TIER_LIMITS = {
    "free": {
        "chat_limit": 50,
        "image_limit": 2,
        "name_zh": "普通用户",
        "name_en": "Free User",
    },
    "pro": {
        "chat_limit": 200,
        "image_limit": 5,
        "name_zh": "高级用户",
        "name_en": "Pro User",
    },
    "plus": {
        "chat_limit": 500,
        "image_limit": 10,
        "name_zh": "超级用户",
        "name_en": "Plus User",
    },
    "admin": {
        "chat_limit": -1,  # -1 表示无限制
        "image_limit": -1,
        "name_zh": "管理员",
        "name_en": "Admin",
    },
}


class UsageService:
    """使用量服务"""

    ACTIONS = {"chat", "image", "ppt"}
    STATUSES = {"success", "failed"}

    def get_tier_limits(self, tier: str) -> Dict[str, Any]:
        """获取指定等级的配额限制"""
        return TIER_LIMITS.get(tier, TIER_LIMITS["free"])

    async def get_or_create_usage(self, db: AsyncSession, user_id: int) -> UserUsage:
        """获取或创建用户使用量记录"""
        result = await db.execute(select(UserUsage).where(UserUsage.user_id == user_id))
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
                "reset_date": None,
                "total_chat_count": 0,
                "total_image_count": 0,
                "total_ppt_count": 0,
                "last_used_at": None,
            }

        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)

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
            "reset_date": usage.reset_date.isoformat() if usage.reset_date else None,
            "total_chat_count": usage.total_chat_count,
            "total_image_count": usage.total_image_count,
            "total_ppt_count": usage.total_ppt_count,
            "last_used_at": usage.last_used_at.isoformat() if usage.last_used_at else None,
        }

    async def check_chat_limit(self, db: AsyncSession, user: User) -> tuple[bool, str]:
        """
        检查用户是否可以发送对话请求

        Returns:
            (可以发送, 错误消息)
        """
        if user.role == "admin":
            return True, ""

        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)

        tier = user.tier or "free"
        chat_limit = self.get_tier_limits(tier)["chat_limit"]
        if usage.chat_count >= chat_limit:
            return False, f"今日对话次数已用完（{chat_limit}/{chat_limit}），请明天再试或升级账户"

        return True, ""

    async def check_image_limit(self, db: AsyncSession, user: User) -> tuple[bool, str]:
        """
        检查用户是否可以发送生图请求

        Returns:
            (可以发送, 错误消息)
        """
        if user.role == "admin":
            return True, ""

        usage = await self.get_or_create_usage(db, user.id)
        usage = await self.check_and_reset_daily(db, usage)

        tier = user.tier or "free"
        image_limit = self.get_tier_limits(tier)["image_limit"]
        if usage.image_count >= image_limit:
            return False, f"今日生图次数已用完（{image_limit}/{image_limit}），请明天再试或升级账户"

        return True, ""

    async def increment_chat_count(self, db: AsyncSession, user: User) -> None:
        """兼容旧调用：增加对话计数并记录事件"""
        if user.role == "admin":
            return

        await self.record_usage_event(
            db,
            user=user,
            action="chat",
            status="success",
            request_id=f"legacy-chat-{uuid.uuid4()}",
            source="legacy_increment_api",
        )

    async def increment_image_count(self, db: AsyncSession, user: User) -> None:
        """兼容旧调用：增加生图计数并记录事件"""
        if user.role == "admin":
            return

        await self.record_usage_event(
            db,
            user=user,
            action="image",
            status="success",
            request_id=f"legacy-image-{uuid.uuid4()}",
            source="legacy_increment_api",
        )

    async def record_usage_event(
        self,
        db: AsyncSession,
        *,
        action: str,
        status: str,
        request_id: str,
        user: Optional[User] = None,
        user_id: Optional[int] = None,
        session_id: Optional[int] = None,
        amount: int = 1,
        error_code: Optional[str] = None,
        source: str = "backend",
        occurred_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        统一记账入口：写入事件、日聚合、成功时回写 user_usages。
        """
        normalized_action = (action or "").lower().strip()
        normalized_status = (status or "").lower().strip()
        if normalized_action not in self.ACTIONS:
            raise ValueError(f"Unsupported usage action: {action}")
        if normalized_status not in self.STATUSES:
            raise ValueError(f"Unsupported usage status: {status}")
        if not request_id:
            raise ValueError("request_id is required")

        resolved_user_id = user.id if user else user_id
        if not resolved_user_id:
            raise ValueError("user or user_id is required")

        safe_amount = max(1, int(amount or 1))
        event_time = occurred_at or datetime.utcnow()

        existing = await db.execute(
            select(UsageEvent).where(
                UsageEvent.user_id == resolved_user_id,
                UsageEvent.action == normalized_action,
                UsageEvent.request_id == request_id,
            )
        )
        duplicated = existing.scalar_one_or_none()
        if duplicated:
            return {
                "recorded": False,
                "duplicated": True,
                "event_id": duplicated.id,
                "request_id": request_id,
            }

        event = UsageEvent(
            user_id=resolved_user_id,
            action=normalized_action,
            status=normalized_status,
            request_id=request_id,
            session_id=session_id,
            amount=safe_amount,
            error_code=error_code,
            source=source,
            occurred_at=event_time,
        )
        db.add(event)
        await db.flush()

        stat_date = event_time.date()
        aggregate_result = await db.execute(
            select(UsageDailyAggregate).where(
                UsageDailyAggregate.stat_date == stat_date,
                UsageDailyAggregate.user_id == resolved_user_id,
                UsageDailyAggregate.action == normalized_action,
                UsageDailyAggregate.status == normalized_status,
            )
        )
        aggregate = aggregate_result.scalar_one_or_none()
        if not aggregate:
            aggregate = UsageDailyAggregate(
                stat_date=stat_date,
                user_id=resolved_user_id,
                action=normalized_action,
                status=normalized_status,
                count=safe_amount,
                updated_at=event_time,
            )
            db.add(aggregate)
        else:
            aggregate.count += safe_amount
            aggregate.updated_at = event_time

        is_admin_user = False
        if user:
            is_admin_user = user.role == "admin"
        else:
            user_row = await db.execute(select(User.role).where(User.id == resolved_user_id))
            role = user_row.scalar_one_or_none()
            is_admin_user = role == "admin"

        if normalized_status == "success" and not is_admin_user:
            usage = await self.get_or_create_usage(db, resolved_user_id)
            usage = await self.check_and_reset_daily(db, usage)

            if normalized_action == "chat":
                usage.chat_count += safe_amount
                usage.total_chat_count += safe_amount
                usage.last_chat_at = event_time
            elif normalized_action == "image":
                usage.image_count += safe_amount
                usage.total_image_count += safe_amount
                usage.last_image_at = event_time
            elif normalized_action == "ppt":
                usage.total_ppt_count += safe_amount
                usage.last_ppt_at = event_time

            usage.last_used_at = event_time

        await db.flush()
        return {
            "recorded": True,
            "duplicated": False,
            "event_id": event.id,
            "request_id": request_id,
        }

    async def get_usage_stats(
        self,
        db: AsyncSession,
        *,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> Dict[str, Any]:
        """管理员用：获取使用量统计（兼容旧字段并扩展新维度）"""
        normalized_action = (action or "").lower().strip() or None
        normalized_status = (status or "").lower().strip() or None

        query = select(User, UserUsage).outerjoin(UserUsage, User.id == UserUsage.user_id)
        if q:
            like_pattern = f"%{q.strip()}%"
            query = query.where(or_(User.username.ilike(like_pattern), User.email.ilike(like_pattern)))

        query = query.order_by(User.created_at.desc())
        rows = (await db.execute(query)).fetchall()

        if not rows:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}

        all_user_ids = [row[0].id for row in rows]

        # 今日维度
        today = date.today()
        today_agg_rows = (
            await db.execute(
                select(
                    UsageDailyAggregate.user_id,
                    UsageDailyAggregate.action,
                    UsageDailyAggregate.status,
                    UsageDailyAggregate.count,
                ).where(
                    UsageDailyAggregate.user_id.in_(all_user_ids),
                    UsageDailyAggregate.stat_date == today,
                )
            )
        ).fetchall()

        today_map: dict[int, dict[str, dict[str, int]]] = {}
        for user_id, agg_action, agg_status, count in today_agg_rows:
            action_map = today_map.setdefault(user_id, {})
            status_map = action_map.setdefault(agg_action, {})
            status_map[agg_status] = status_map.get(agg_status, 0) + int(count or 0)

        # 累计失败次数从聚合表按 action/status 汇总
        total_failed_rows = (
            await db.execute(
                select(
                    UsageDailyAggregate.user_id,
                    UsageDailyAggregate.action,
                    func.sum(UsageDailyAggregate.count),
                )
                .where(
                    UsageDailyAggregate.user_id.in_(all_user_ids),
                    UsageDailyAggregate.status == "failed",
                )
                .group_by(UsageDailyAggregate.user_id, UsageDailyAggregate.action)
            )
        ).fetchall()

        total_failed_map: dict[int, dict[str, int]] = {}
        for user_id, agg_action, total_count in total_failed_rows:
            user_map = total_failed_map.setdefault(user_id, {})
            user_map[agg_action] = int(total_count or 0)

        # 过滤条件下的命中统计（用于筛选用户）
        filtered_query = select(
            UsageDailyAggregate.user_id,
            UsageDailyAggregate.status,
            func.sum(UsageDailyAggregate.count),
        ).where(UsageDailyAggregate.user_id.in_(all_user_ids))

        if normalized_action:
            filtered_query = filtered_query.where(UsageDailyAggregate.action == normalized_action)
        if normalized_status:
            filtered_query = filtered_query.where(UsageDailyAggregate.status == normalized_status)
        if start_at:
            filtered_query = filtered_query.where(UsageDailyAggregate.stat_date >= start_at.date())
        if end_at:
            filtered_query = filtered_query.where(UsageDailyAggregate.stat_date <= end_at.date())

        filtered_query = filtered_query.group_by(UsageDailyAggregate.user_id, UsageDailyAggregate.status)
        filtered_rows = (await db.execute(filtered_query)).fetchall()

        filtered_map: dict[int, dict[str, int]] = {}
        for user_id, agg_status, total_count in filtered_rows:
            user_map = filtered_map.setdefault(user_id, {})
            user_map[agg_status] = int(total_count or 0)

        has_filters = bool(normalized_action or normalized_status or start_at or end_at)

        items = []
        for user, usage in rows:
            filtered_success = filtered_map.get(user.id, {}).get("success", 0)
            filtered_failed = filtered_map.get(user.id, {}).get("failed", 0)
            if has_filters and (filtered_success + filtered_failed) == 0:
                continue

            if user.role == "admin":
                tier_info = self.get_tier_limits("admin")
                items.append(
                    {
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
                        "ppt_used": today_map.get(user.id, {}).get("ppt", {}).get("success", 0),
                        "chat_failed_today": today_map.get(user.id, {}).get("chat", {}).get("failed", 0),
                        "image_failed_today": today_map.get(user.id, {}).get("image", {}).get("failed", 0),
                        "ppt_failed_today": today_map.get(user.id, {}).get("ppt", {}).get("failed", 0),
                        "chat_total_success": 0,
                        "image_total_success": 0,
                        "ppt_total_success": 0,
                        "chat_total_failed": total_failed_map.get(user.id, {}).get("chat", 0),
                        "image_total_failed": total_failed_map.get(user.id, {}).get("image", 0),
                        "ppt_total_failed": total_failed_map.get(user.id, {}).get("ppt", 0),
                        "filtered_success_count": filtered_success,
                        "filtered_failed_count": filtered_failed,
                        "last_used_at": None,
                        "is_unlimited": True,
                    }
                )
                continue

            tier = user.tier or "free"
            tier_info = self.get_tier_limits(tier)

            chat_used = 0
            image_used = 0
            if usage and usage.reset_date and usage.reset_date >= today:
                chat_used = usage.chat_count
                image_used = usage.image_count

            items.append(
                {
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": user.role,
                    "tier": tier,
                    "tier_name_zh": tier_info["name_zh"],
                    "tier_name_en": tier_info["name_en"],
                    "chat_limit": tier_info["chat_limit"],
                    "chat_used": chat_used,
                    "image_limit": tier_info["image_limit"],
                    "image_used": image_used,
                    "ppt_used": today_map.get(user.id, {}).get("ppt", {}).get("success", 0),
                    "chat_failed_today": today_map.get(user.id, {}).get("chat", {}).get("failed", 0),
                    "image_failed_today": today_map.get(user.id, {}).get("image", {}).get("failed", 0),
                    "ppt_failed_today": today_map.get(user.id, {}).get("ppt", {}).get("failed", 0),
                    "chat_total_success": int(usage.total_chat_count if usage else 0),
                    "image_total_success": int(usage.total_image_count if usage else 0),
                    "ppt_total_success": int(usage.total_ppt_count if usage else 0),
                    "chat_total_failed": total_failed_map.get(user.id, {}).get("chat", 0),
                    "image_total_failed": total_failed_map.get(user.id, {}).get("image", 0),
                    "ppt_total_failed": total_failed_map.get(user.id, {}).get("ppt", 0),
                    "filtered_success_count": filtered_success,
                    "filtered_failed_count": filtered_failed,
                    "last_used_at": usage.last_used_at.isoformat() if usage and usage.last_used_at else None,
                    "is_unlimited": False,
                }
            )

        total = len(items)
        safe_page = max(1, page)
        safe_page_size = min(max(1, page_size), 500)
        start_idx = (safe_page - 1) * safe_page_size
        end_idx = start_idx + safe_page_size

        return {
            "total": total,
            "page": safe_page,
            "page_size": safe_page_size,
            "items": items[start_idx:end_idx],
        }

    async def list_usage_events(
        self,
        db: AsyncSession,
        *,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        user_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """管理员用：分页查询使用量事件流水"""
        safe_page = max(1, page)
        safe_page_size = min(max(1, page_size), 500)
        offset = (safe_page - 1) * safe_page_size

        normalized_action = (action or "").lower().strip() or None
        normalized_status = (status or "").lower().strip() or None

        base_query = (
            select(UsageEvent, User.username, User.email)
            .join(User, User.id == UsageEvent.user_id)
            .order_by(UsageEvent.occurred_at.desc(), UsageEvent.id.desc())
        )

        filters = []
        if user_id:
            filters.append(UsageEvent.user_id == user_id)
        if normalized_action:
            filters.append(UsageEvent.action == normalized_action)
        if normalized_status:
            filters.append(UsageEvent.status == normalized_status)
        if start_at:
            filters.append(UsageEvent.occurred_at >= start_at)
        if end_at:
            filters.append(UsageEvent.occurred_at <= end_at)
        if q:
            like_pattern = f"%{q.strip()}%"
            filters.append(or_(User.username.ilike(like_pattern), User.email.ilike(like_pattern)))

        if filters:
            base_query = base_query.where(and_(*filters))

        total_query = select(func.count()).select_from(base_query.order_by(None).subquery())
        total = (await db.execute(total_query)).scalar() or 0

        paged_query = base_query.offset(offset).limit(safe_page_size)
        rows = (await db.execute(paged_query)).fetchall()

        items = []
        for event, username, email in rows:
            items.append(
                {
                    "id": event.id,
                    "user_id": event.user_id,
                    "username": username,
                    "email": email,
                    "action": event.action,
                    "status": event.status,
                    "request_id": event.request_id,
                    "session_id": event.session_id,
                    "amount": event.amount,
                    "error_code": event.error_code,
                    "source": event.source,
                    "occurred_at": event.occurred_at.isoformat() if event.occurred_at else None,
                    "created_at": event.created_at.isoformat() if event.created_at else None,
                }
            )

        return {
            "total": int(total),
            "page": safe_page,
            "page_size": safe_page_size,
            "items": items,
        }

    async def export_usage_events(
        self,
        db: AsyncSession,
        *,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        """导出使用量事件（CSV 用）"""
        result = await self.list_usage_events(
            db,
            start_at=start_at,
            end_at=end_at,
            action=action,
            status=status,
            q=q,
            page=1,
            page_size=100000,
        )
        return result["items"]

    async def get_all_usage_stats(self, db: AsyncSession) -> list[Dict[str, Any]]:
        """兼容旧接口：获取所有用户使用量统计（管理员用）"""
        result = await self.get_usage_stats(db, page=1, page_size=500)
        return result["items"]


# 单例
usage_service = UsageService()
