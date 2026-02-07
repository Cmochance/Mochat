"""
使用量对账服务：用于校验 usage_events / usage_daily_aggregates / user_usages 一致性
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import UsageDailyAggregate, UsageEvent, User, UserUsage


class UsageReconcileService:
    """使用量对账服务"""

    async def reconcile(self, db: AsyncSession, user_id: Optional[int] = None) -> Dict[str, Any]:
        user_filter = []
        if user_id:
            user_filter.append(User.id == user_id)

        users_query = select(User.id, User.username, User.role)
        if user_filter:
            users_query = users_query.where(*user_filter)

        user_rows = (await db.execute(users_query)).fetchall()
        user_map = {row.id: {"username": row.username, "role": row.role} for row in user_rows}
        user_ids = list(user_map.keys())

        if not user_ids:
            return {
                "generated_at": datetime.utcnow().isoformat(),
                "summary": {
                    "users_checked": 0,
                    "user_total_mismatches": 0,
                    "aggregate_mismatches": 0,
                },
                "user_total_mismatches": [],
                "aggregate_mismatches": [],
            }

        usage_rows = (
            await db.execute(
                select(UserUsage)
                .where(UserUsage.user_id.in_(user_ids))
                .order_by(UserUsage.user_id.asc())
            )
        ).scalars().all()
        usage_map = {row.user_id: row for row in usage_rows}

        success_totals_rows = (
            await db.execute(
                select(
                    UsageDailyAggregate.user_id,
                    UsageDailyAggregate.action,
                    func.sum(UsageDailyAggregate.count),
                )
                .where(
                    UsageDailyAggregate.user_id.in_(user_ids),
                    UsageDailyAggregate.status == "success",
                )
                .group_by(UsageDailyAggregate.user_id, UsageDailyAggregate.action)
            )
        ).fetchall()

        success_totals_map: dict[int, dict[str, int]] = {}
        for row_user_id, action, total_count in success_totals_rows:
            action_map = success_totals_map.setdefault(row_user_id, {})
            action_map[action] = int(total_count or 0)

        user_total_mismatches = []
        for uid in user_ids:
            profile = user_map.get(uid, {})
            if profile.get("role") == "admin":
                continue

            usage = usage_map.get(uid)
            expected_chat = success_totals_map.get(uid, {}).get("chat", 0)
            expected_image = success_totals_map.get(uid, {}).get("image", 0)
            expected_ppt = success_totals_map.get(uid, {}).get("ppt", 0)

            actual_chat = int(usage.total_chat_count if usage else 0)
            actual_image = int(usage.total_image_count if usage else 0)
            actual_ppt = int(usage.total_ppt_count if usage else 0)

            if expected_chat != actual_chat:
                user_total_mismatches.append(
                    {
                        "user_id": uid,
                        "username": profile.get("username"),
                        "metric": "total_chat_count",
                        "expected": expected_chat,
                        "actual": actual_chat,
                    }
                )
            if expected_image != actual_image:
                user_total_mismatches.append(
                    {
                        "user_id": uid,
                        "username": profile.get("username"),
                        "metric": "total_image_count",
                        "expected": expected_image,
                        "actual": actual_image,
                    }
                )
            if expected_ppt != actual_ppt:
                user_total_mismatches.append(
                    {
                        "user_id": uid,
                        "username": profile.get("username"),
                        "metric": "total_ppt_count",
                        "expected": expected_ppt,
                        "actual": actual_ppt,
                    }
                )

        events_by_day_rows = (
            await db.execute(
                select(
                    func.date(UsageEvent.occurred_at),
                    UsageEvent.user_id,
                    UsageEvent.action,
                    UsageEvent.status,
                    func.sum(UsageEvent.amount),
                )
                .where(UsageEvent.user_id.in_(user_ids))
                .group_by(
                    func.date(UsageEvent.occurred_at),
                    UsageEvent.user_id,
                    UsageEvent.action,
                    UsageEvent.status,
                )
            )
        ).fetchall()

        aggregates_by_day_rows = (
            await db.execute(
                select(
                    UsageDailyAggregate.stat_date,
                    UsageDailyAggregate.user_id,
                    UsageDailyAggregate.action,
                    UsageDailyAggregate.status,
                    func.sum(UsageDailyAggregate.count),
                )
                .where(UsageDailyAggregate.user_id.in_(user_ids))
                .group_by(
                    UsageDailyAggregate.stat_date,
                    UsageDailyAggregate.user_id,
                    UsageDailyAggregate.action,
                    UsageDailyAggregate.status,
                )
            )
        ).fetchall()

        event_map = {
            (str(stat_date), uid, action, status): int(total_count or 0)
            for stat_date, uid, action, status, total_count in events_by_day_rows
        }
        aggregate_map = {
            (str(stat_date), uid, action, status): int(total_count or 0)
            for stat_date, uid, action, status, total_count in aggregates_by_day_rows
        }

        aggregate_mismatches = []
        for key in sorted(set(event_map.keys()) | set(aggregate_map.keys())):
            event_count = event_map.get(key, 0)
            aggregate_count = aggregate_map.get(key, 0)
            if event_count != aggregate_count:
                stat_date, uid, action, status = key
                aggregate_mismatches.append(
                    {
                        "stat_date": stat_date,
                        "user_id": uid,
                        "username": user_map.get(uid, {}).get("username"),
                        "action": action,
                        "status": status,
                        "events_count": event_count,
                        "aggregate_count": aggregate_count,
                    }
                )

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {
                "users_checked": len(user_ids),
                "user_total_mismatches": len(user_total_mismatches),
                "aggregate_mismatches": len(aggregate_mismatches),
            },
            "user_total_mismatches": user_total_mismatches[:200],
            "aggregate_mismatches": aggregate_mismatches[:200],
        }


usage_reconcile_service = UsageReconcileService()
