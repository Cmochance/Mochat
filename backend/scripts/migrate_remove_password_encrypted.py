#!/usr/bin/env python3
"""
数据库迁移脚本：移除 password_encrypted 字段数据

⚠️ 安全警告：此脚本用于清理不安全的密码加密存储。
   执行前请确保已备份数据库。

用法：
  python backend/scripts/migrate_remove_password_encrypted.py --execute
"""

import asyncio
import argparse
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from app.core.config import settings


async def migrate_password_encrypted(engine, execute: bool = False):
    """
    迁移 password_encrypted 字段数据
    
    这个脚本执行以下操作：
    1. 检查有多少用户的 password_encrypted 字段非空
    2. 将所有 password_encrypted 字段设置为 NULL
    3. （可选）删除 password_encrypted 列
    """

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            # 检查当前状态
            print("🔍 检查数据库状态...")
            
            result = await session.execute(
                text("SELECT COUNT(*) as count, COUNT(password_encrypted) as encrypted_count FROM users")
            )
            row = result.fetchone()
            total_users = row[0] if row else 0
            encrypted_users = row[1] if row else 0

            print(f"📊 当前数据库状态：")
            print(f"   总用户数：{total_users}")
            print(f"   含加密密码的用户数：{encrypted_users}")

            if encrypted_users == 0:
                print("✅ 没有需要清理的加密密码数据")
                return

            if not execute:
                print("\n📋 计划执行的操作：")
                print(f"   - 清理 {encrypted_users} 用户的 password_encrypted 字段")
                print(f"   - 设置 password_encrypted = NULL")
                print("\n⚠️  这是预览模式，不会修改数据")
                print("   如需执行，请添加 --execute 参数")
                return

            # 执行清理
            print(f"\n🔧 开始清理 {encrypted_users} 用户的加密密码...")
            
            # 使用安全的批量更新
            result = await session.execute(
                text("UPDATE users SET password_encrypted = NULL WHERE password_encrypted IS NOT NULL")
            )
            updated_count = result.rowcount

            await session.commit()
            
            print(f"✅ 成功清理了 {updated_count} 用户的加密密码数据")

            # 验证清理结果
            result = await session.execute(
                text("SELECT COUNT(password_encrypted) as count FROM users WHERE password_encrypted IS NOT NULL")
            )
            remaining_count = result.scalar()

            if remaining_count == 0:
                print("✅ 所有加密密码数据已清理完毕")
            else:
                print(f"⚠️  仍有 {remaining_count} 个用户包含加密密码数据")

        except Exception as e:
            await session.rollback()
            print(f"❌ 迁移失败：{str(e)}")
            raise


async def check_column_exists(engine, column_name: str = "password_encrypted") -> bool:
    """检查列是否存在"""
    async with engine.begin() as conn:
        # 对于 SQLite
        if "sqlite" in settings.DATABASE_URL.lower():
            result = await conn.execute(
                text(f"PRAGMA table_info(users)")
            )
            columns = [row[1] for row in result.fetchall()]
            return column_name in columns
        # 对于 PostgreSQL
        else:
            result = await conn.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = :column_name
                """),
                {"column_name": column_name}
            )
            return result.fetchone() is not None


async def main():
    parser = argparse.ArgumentParser(description="移除不安全的密码加密存储")
    parser.add_argument("--execute", action="store_true", help="实际执行迁移（默认仅预览）")
    parser.add_argument("--drop-column", action="store_true", help="删除 password_encrypted 列（谨慎使用）")
    args = parser.parse_args()

    print("=" * 60)
    print("🔐 密码加密数据清理工具")
    print("=" * 60)

    # 检查数据库连接
    print(f"📡 连接数据库：{settings.DATABASE_URL}")
    
    try:
        engine = create_async_engine(settings.DATABASE_URL, echo=False)

        # 检查列是否存在
        column_exists = await check_column_exists(engine)
        if not column_exists:
            print("✅ password_encrypted 列不存在，无需清理")
            return

        # 执行迁移
        await migrate_password_encrypted(engine, execute=args.execute)

        # 可选：删除列
        if args.drop_column and args.execute:
            print("\n⚠️  准备删除 password_encrypted 列...")
            print("   此操作不可逆，请确认：")
            response = input("   输入 'yes' 确认删除列：")
            
            if response.lower() == 'yes':
                async with engine.begin() as conn:
                    # 对于 SQLite
                    if "sqlite" in settings.DATABASE_URL.lower():
                        print("⚠️  SQLite 不支持直接删除列，需要重建表")
                        print("   请手动重建表或继续保留该列（值为 NULL）")
                    # 对于 PostgreSQL
                    else:
                        await conn.execute(
                            text("ALTER TABLE users DROP COLUMN password_encrypted")
                        )
                        print("✅ password_encrypted 列已删除")
            else:
                print("📝 password_encrypted 列保留，但所有数据已清空")

        await engine.dispose()

    except Exception as e:
        print(f"❌ 发生错误：{str(e)}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✅ 迁移完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
