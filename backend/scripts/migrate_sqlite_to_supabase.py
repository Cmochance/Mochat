#!/usr/bin/env python3
"""
SQLite -> Supabase(Postgres + Auth) 迁移脚本

用法示例：
  # 仅校验（默认）
  python backend/scripts/migrate_sqlite_to_supabase.py \
    --source-sqlite-url sqlite+aiosqlite:////data/mochat.db \
    --target-postgres-url postgresql+asyncpg://...

  # 正式执行
  python backend/scripts/migrate_sqlite_to_supabase.py \
    --source-sqlite-url sqlite+aiosqlite:////data/mochat.db \
    --target-postgres-url postgresql+asyncpg://... \
    --supabase-url https://xxx.supabase.co \
    --supabase-service-role-key ... \
    --secret-key ... \
    --execute
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import secrets
import sys
from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sqlalchemy import MetaData, inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine


TABLE_ORDER = [
    "users",
    "user_usages",
    "chat_sessions",
    "messages",
    "usage_events",
    "usage_daily_aggregates",
    "system_config",
    "restricted_keywords",
    "allowed_models",
    "verification_codes",
    "verification_ip_limits",
]

ID_TABLES = [
    ("users", "id"),
    ("user_usages", "id"),
    ("chat_sessions", "id"),
    ("messages", "id"),
    ("usage_events", "id"),
    ("restricted_keywords", "id"),
    ("allowed_models", "id"),
    ("verification_codes", "id"),
]


@dataclass
class UserMigrationFailure:
    user_id: int
    email: str
    reason: str


@dataclass
class MigrationReport:
    generated_at: str
    mode: str
    source_counts: Dict[str, int]
    target_counts: Dict[str, int]
    decryptable_passwords: int
    undecryptable_passwords: int
    password_reset_required_emails: List[str]
    user_failures: List[UserMigrationFailure]
    foreign_key_issues: Dict[str, int]
    sampled_sessions_checked: int
    sampled_sessions_mismatches: int


def build_fernet(secret_key: str) -> Fernet:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"mochat_password_salt",
        iterations=100000,
    )
    derived = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
    return Fernet(derived)


def decrypt_password(encrypted_password: Optional[str], fernet: Optional[Fernet]) -> Optional[str]:
    if not encrypted_password or not fernet:
        return None
    try:
        return fernet.decrypt(encrypted_password.encode()).decode()
    except Exception:
        return None


def service_headers(service_role_key: str) -> Dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


async def supabase_find_user_by_email(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_role_key: str,
    email: str,
) -> Optional[str]:
    page = 1
    per_page = 200
    normalized_email = email.strip().lower()

    while True:
        url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users?page={page}&per_page={per_page}"
        resp = await client.get(url, headers=service_headers(service_role_key))
        if resp.status_code >= 400:
            return None
        data = resp.json()
        users = data.get("users") if isinstance(data, dict) else None
        if not users:
            return None
        for user in users:
            user_email = str(user.get("email") or "").strip().lower()
            if user_email == normalized_email:
                return user.get("id")
        if len(users) < per_page:
            return None
        page += 1


async def supabase_create_user(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_role_key: str,
    *,
    email: str,
    password: str,
    username: str,
) -> Tuple[Optional[str], Optional[str]]:
    url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users"
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"username": username},
    }
    resp = await client.post(url, headers=service_headers(service_role_key), json=payload)
    if resp.status_code < 400:
        body = resp.json()
        return body.get("id"), None

    # 已存在用户时尝试查找复用
    try:
        error_body = resp.json()
    except Exception:
        error_body = {"message": resp.text}
    message = str(error_body.get("msg") or error_body.get("message") or "create user failed")
    if "exists" in message.lower() or "already" in message.lower():
        existing_id = await supabase_find_user_by_email(client, supabase_url, service_role_key, email)
        if existing_id:
            return existing_id, None
    return None, message


async def get_table_names(conn: AsyncConnection) -> List[str]:
    return await conn.run_sync(lambda c: inspect(c).get_table_names())


async def fetch_table_rows(conn: AsyncConnection, table_name: str) -> List[Dict[str, Any]]:
    result = await conn.execute(text(f'SELECT * FROM "{table_name}"'))
    return [dict(row) for row in result.mappings().all()]


async def fetch_counts(conn: AsyncConnection, table_names: List[str]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for table in table_names:
        result = await conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
        counts[table] = int(result.scalar() or 0)
    return counts


def _coerce_row_for_insert(row: Dict[str, Any], table_obj) -> Dict[str, Any]:
    coerced: Dict[str, Any] = {}
    for col in table_obj.c:
        if col.name not in row:
            continue
        value = row[col.name]
        if value is None:
            coerced[col.name] = None
            continue

        py_type = None
        try:
            py_type = col.type.python_type
        except Exception:
            py_type = None

        if py_type is datetime and isinstance(value, str):
            try:
                coerced[col.name] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                coerced[col.name] = value
            continue

        if py_type is date and isinstance(value, str):
            try:
                coerced[col.name] = date.fromisoformat(value[:10])
            except Exception:
                coerced[col.name] = value
            continue

        if py_type is bool and isinstance(value, int):
            coerced[col.name] = bool(value)
            continue

        coerced[col.name] = value
    return coerced


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mochat SQLite -> Supabase 迁移工具")
    parser.add_argument(
        "--source-sqlite-url",
        default=os.getenv("SOURCE_SQLITE_URL", "sqlite+aiosqlite:///./mochat.db"),
        help="源 SQLite URL",
    )
    parser.add_argument(
        "--target-postgres-url",
        default=os.getenv("TARGET_POSTGRES_URL", os.getenv("DATABASE_URL", "")),
        help="目标 Postgres URL（建议 postgresql+asyncpg://）",
    )
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""))
    parser.add_argument("--supabase-service-role-key", default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    parser.add_argument("--secret-key", default=os.getenv("SECRET_KEY", ""))
    parser.add_argument("--execute", action="store_true", help="执行正式迁移")
    parser.add_argument(
        "--report-path",
        default=os.getenv("MIGRATION_REPORT_PATH", "migration_report.json"),
        help="迁移报告输出路径",
    )
    return parser.parse_args()


async def main() -> int:
    args = parse_args()
    execute_mode = bool(args.execute)

    if not args.target_postgres_url:
        print("[ERROR] 缺少 --target-postgres-url / TARGET_POSTGRES_URL / DATABASE_URL")
        return 2

    if execute_mode:
        if not args.supabase_url or not args.supabase_service_role_key:
            print("[ERROR] 执行模式需要 --supabase-url 与 --supabase-service-role-key")
            return 2
        if not args.secret_key:
            print("[ERROR] 执行模式需要 --secret-key（用于解密 password_encrypted）")
            return 2

    source_engine = create_async_engine(args.source_sqlite_url, future=True)
    target_engine = create_async_engine(args.target_postgres_url, future=True)

    report = MigrationReport(
        generated_at=datetime.utcnow().isoformat(),
        mode="execute" if execute_mode else "dry-run",
        source_counts={},
        target_counts={},
        decryptable_passwords=0,
        undecryptable_passwords=0,
        password_reset_required_emails=[],
        user_failures=[],
        foreign_key_issues={},
        sampled_sessions_checked=0,
        sampled_sessions_mismatches=0,
    )

    fernet = build_fernet(args.secret_key) if args.secret_key else None

    try:
        async with source_engine.connect() as source_conn, target_engine.connect() as target_conn:
            source_tables = set(await get_table_names(source_conn))
            target_tables = set(await get_table_names(target_conn))

            source_migration_tables = [t for t in TABLE_ORDER if t in source_tables]
            target_migration_tables = [t for t in TABLE_ORDER if t in target_tables]

            report.source_counts = await fetch_counts(source_conn, source_migration_tables)
            report.target_counts = await fetch_counts(target_conn, target_migration_tables)

            # 用户密码解密可用性统计
            users_rows = await fetch_table_rows(source_conn, "users") if "users" in source_tables else []
            for row in users_rows:
                plain = decrypt_password(row.get("password_encrypted"), fernet)
                if plain:
                    report.decryptable_passwords += 1
                else:
                    report.undecryptable_passwords += 1
                    if row.get("email"):
                        report.password_reset_required_emails.append(str(row["email"]))

            if not execute_mode:
                report.password_reset_required_emails = sorted(set(report.password_reset_required_emails))
                with open(args.report_path, "w", encoding="utf-8") as f:
                    json.dump(asdict(report), f, ensure_ascii=False, indent=2)
                print(f"[DRY-RUN] 完成，报告输出: {args.report_path}")
                print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
                return 0

            missing_target_tables = [t for t in TABLE_ORDER if t not in target_tables]
            if missing_target_tables:
                print(f"[ERROR] 目标库缺少表: {missing_target_tables}")
                return 3

            # 预加载源数据
            source_data: Dict[str, List[Dict[str, Any]]] = {}
            for table in TABLE_ORDER:
                source_data[table] = await fetch_table_rows(source_conn, table) if table in source_tables else []

            # 先处理 users（创建 Supabase Auth 用户并回填 supabase_auth_id）
            migrated_users: List[Dict[str, Any]] = []
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
                for row in source_data["users"]:
                    email = str(row.get("email") or "").strip().lower()
                    username = str(row.get("username") or "")
                    user_id = int(row.get("id"))
                    supabase_auth_id = row.get("supabase_auth_id")

                    if not email:
                        report.user_failures.append(
                            UserMigrationFailure(user_id=user_id, email="", reason="missing email")
                        )
                        continue

                    if not supabase_auth_id:
                        plain_password = decrypt_password(row.get("password_encrypted"), fernet)
                        if not plain_password:
                            plain_password = secrets.token_urlsafe(18)
                            report.password_reset_required_emails.append(email)

                        created_id, error = await supabase_create_user(
                            client,
                            args.supabase_url,
                            args.supabase_service_role_key,
                            email=email,
                            password=plain_password,
                            username=username,
                        )
                        if error or not created_id:
                            report.user_failures.append(
                                UserMigrationFailure(
                                    user_id=user_id,
                                    email=email,
                                    reason=error or "unknown create user error",
                                )
                            )
                            continue
                        supabase_auth_id = created_id

                    new_row = dict(row)
                    new_row["supabase_auth_id"] = str(supabase_auth_id)
                    migrated_users.append(new_row)

            if report.user_failures:
                report.password_reset_required_emails = sorted(set(report.password_reset_required_emails))
                with open(args.report_path, "w", encoding="utf-8") as f:
                    json.dump(asdict(report), f, ensure_ascii=False, indent=2)
                print("[ERROR] 用户迁移失败，已中止执行。详情见报告。")
                print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
                return 4

            source_data["users"] = migrated_users

            # 清洗孤儿引用（SQLite 可能存在未启用 FK 约束的历史脏数据）
            valid_user_ids = {int(row.get("id")) for row in source_data.get("users", []) if row.get("id") is not None}
            original_chat_sessions = source_data.get("chat_sessions", [])
            source_data["chat_sessions"] = [
                row for row in original_chat_sessions
                if row.get("user_id") is not None and int(row.get("user_id")) in valid_user_ids
            ]
            valid_session_ids = {int(row.get("id")) for row in source_data.get("chat_sessions", []) if row.get("id") is not None}
            original_messages = source_data.get("messages", [])
            source_data["messages"] = [
                row for row in original_messages
                if row.get("session_id") is not None and int(row.get("session_id")) in valid_session_ids
            ]

            # 其余按 user_id 关联的表也做保护性过滤
            for table_name in ["user_usages", "usage_events", "usage_daily_aggregates"]:
                original_rows = source_data.get(table_name, [])
                source_data[table_name] = [
                    row for row in original_rows
                    if row.get("user_id") is not None and int(row.get("user_id")) in valid_user_ids
                ]

            dropped_sessions = len(original_chat_sessions) - len(source_data.get("chat_sessions", []))
            dropped_messages = len(original_messages) - len(source_data.get("messages", []))
            if dropped_sessions or dropped_messages:
                print(
                    f"[WARN] 发现并过滤孤儿数据: chat_sessions={dropped_sessions}, messages={dropped_messages}"
                )

            # 反射目标元数据
            metadata = MetaData()
            await target_conn.run_sync(lambda c: metadata.reflect(bind=c, only=TABLE_ORDER))

            if target_conn.in_transaction():
                await target_conn.commit()
            tx = await target_conn.begin()
            try:
                truncate_tables = [t for t in TABLE_ORDER if t in target_tables]
                if truncate_tables:
                    truncate_sql = (
                        "TRUNCATE TABLE "
                        + ", ".join([f'"{table}"' for table in truncate_tables])
                        + " RESTART IDENTITY CASCADE"
                    )
                    await target_conn.execute(text(truncate_sql))

                for table in TABLE_ORDER:
                    rows = source_data.get(table, [])
                    if not rows:
                        continue
                    table_obj = metadata.tables.get(table)
                    if table_obj is None:
                        continue
                    payload = [_coerce_row_for_insert(row, table_obj) for row in rows]
                    await target_conn.execute(table_obj.insert(), payload)

                for table, column in ID_TABLES:
                    if table not in target_tables:
                        continue
                    await target_conn.execute(
                        text(
                            "SELECT setval(pg_get_serial_sequence(:table_name, :column_name), "
                            "COALESCE((SELECT MAX(" + column + ") FROM " + table + "), 1), true)"
                        ),
                        {"table_name": table, "column_name": column},
                    )

                await tx.commit()
            except Exception:
                await tx.rollback()
                raise

            report.target_counts = await fetch_counts(target_conn, [t for t in TABLE_ORDER if t in target_tables])

            # 外键完整性检查
            integrity_queries = {
                "orphan_chat_sessions_user": (
                    'SELECT COUNT(*) FROM "chat_sessions" cs LEFT JOIN "users" u ON u.id = cs.user_id WHERE u.id IS NULL'
                ),
                "orphan_messages_session": (
                    'SELECT COUNT(*) FROM "messages" m LEFT JOIN "chat_sessions" cs ON cs.id = m.session_id WHERE cs.id IS NULL'
                ),
                "orphan_user_usages_user": (
                    'SELECT COUNT(*) FROM "user_usages" uu LEFT JOIN "users" u ON u.id = uu.user_id WHERE u.id IS NULL'
                ),
                "orphan_usage_events_user": (
                    'SELECT COUNT(*) FROM "usage_events" ue LEFT JOIN "users" u ON u.id = ue.user_id WHERE u.id IS NULL'
                ),
                "orphan_usage_daily_user": (
                    'SELECT COUNT(*) FROM "usage_daily_aggregates" uda LEFT JOIN "users" u ON u.id = uda.user_id WHERE u.id IS NULL'
                ),
            }
            for key, sql in integrity_queries.items():
                result = await target_conn.execute(text(sql))
                report.foreign_key_issues[key] = int(result.scalar() or 0)

            # 抽样会话消息一致性检查（最多 50 个会话）
            source_message_rows = source_data.get("messages", [])
            source_msg_count_by_session: Dict[int, int] = {}
            for row in source_message_rows:
                sid = int(row.get("session_id"))
                source_msg_count_by_session[sid] = source_msg_count_by_session.get(sid, 0) + 1

            sampled_rows = (
                await target_conn.execute(text('SELECT id FROM "chat_sessions" ORDER BY random() LIMIT 50'))
            ).fetchall()
            sampled_session_ids = [int(row[0]) for row in sampled_rows]
            report.sampled_sessions_checked = len(sampled_session_ids)

            if sampled_session_ids:
                in_clause = ",".join(str(sid) for sid in sampled_session_ids)
                target_count_rows = (
                    await target_conn.execute(
                        text(
                            'SELECT session_id, COUNT(*) FROM "messages" '
                            f"WHERE session_id IN ({in_clause}) GROUP BY session_id"
                        )
                    )
                ).fetchall()
                target_msg_count_by_session = {int(row[0]): int(row[1]) for row in target_count_rows}
                mismatch = 0
                for sid in sampled_session_ids:
                    source_count = source_msg_count_by_session.get(sid, 0)
                    target_count = target_msg_count_by_session.get(sid, 0)
                    if source_count != target_count:
                        mismatch += 1
                report.sampled_sessions_mismatches = mismatch

            report.password_reset_required_emails = sorted(set(report.password_reset_required_emails))

            with open(args.report_path, "w", encoding="utf-8") as f:
                json.dump(asdict(report), f, ensure_ascii=False, indent=2)

            print(f"[EXECUTE] 迁移完成，报告输出: {args.report_path}")
            print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
            return 0
    finally:
        await source_engine.dispose()
        await target_engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
