"""
数据库连接模块 - 管理数据库会话
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text, inspect
from ..core.config import settings

# 创建异步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True
)

# 创建异步会话工厂
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# 创建基类
Base = declarative_base()


async def get_db():
    """获取数据库会话的依赖函数"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def migrate_db(conn):
    """
    数据库迁移 - 检查并添加缺失的列
    用于兼容旧数据库结构
    """
    def check_and_migrate(connection):
        inspector = inspect(connection)
        table_names = inspector.get_table_names()

        def add_column_if_missing(table_name: str, column_name: str, alter_sql: str) -> None:
            if table_name not in table_names:
                return
            columns = [col["name"] for col in inspector.get_columns(table_name)]
            if column_name in columns:
                return
            print(f"[Migration] Adding '{column_name}' column to {table_name} table...")
            connection.execute(text(alter_sql))
            print(f"[Migration] Column '{column_name}' added successfully.")

        def add_index_if_missing(table_name: str, index_name: str, create_sql: str) -> None:
            if table_name not in table_names:
                return
            indexes = [idx.get("name") for idx in inspector.get_indexes(table_name)]
            if index_name in indexes:
                return
            print(f"[Migration] Creating index '{index_name}' on {table_name} table...")
            connection.execute(text(create_sql))
            print(f"[Migration] Index '{index_name}' created successfully.")
        
        # users 表历史迁移
        add_column_if_missing(
            "users",
            "password_encrypted",
            "ALTER TABLE users ADD COLUMN password_encrypted VARCHAR(500)",
        )
        add_column_if_missing(
            "users",
            "last_seen_version",
            "ALTER TABLE users ADD COLUMN last_seen_version VARCHAR(20)",
        )
        add_column_if_missing(
            "users",
            "tier",
            "ALTER TABLE users ADD COLUMN tier VARCHAR(20) DEFAULT 'free'",
        )
        add_column_if_missing(
            "users",
            "supabase_auth_id",
            "ALTER TABLE users ADD COLUMN supabase_auth_id VARCHAR(64)",
        )
        add_index_if_missing(
            "users",
            "uq_users_supabase_auth_id",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_supabase_auth_id ON users (supabase_auth_id)",
        )

        # user_usages 表扩展字段迁移
        add_column_if_missing(
            "user_usages",
            "total_chat_count",
            "ALTER TABLE user_usages ADD COLUMN total_chat_count INTEGER DEFAULT 0",
        )
        add_column_if_missing(
            "user_usages",
            "total_image_count",
            "ALTER TABLE user_usages ADD COLUMN total_image_count INTEGER DEFAULT 0",
        )
        add_column_if_missing(
            "user_usages",
            "total_ppt_count",
            "ALTER TABLE user_usages ADD COLUMN total_ppt_count INTEGER DEFAULT 0",
        )
        add_column_if_missing(
            "user_usages",
            "last_used_at",
            "ALTER TABLE user_usages ADD COLUMN last_used_at DATETIME",
        )
        add_column_if_missing(
            "user_usages",
            "last_chat_at",
            "ALTER TABLE user_usages ADD COLUMN last_chat_at DATETIME",
        )
        add_column_if_missing(
            "user_usages",
            "last_image_at",
            "ALTER TABLE user_usages ADD COLUMN last_image_at DATETIME",
        )
        add_column_if_missing(
            "user_usages",
            "last_ppt_at",
            "ALTER TABLE user_usages ADD COLUMN last_ppt_at DATETIME",
        )
    
    await conn.run_sync(check_and_migrate)


async def init_db():
    """初始化数据库，创建所有表并执行迁移"""
    async with engine.begin() as conn:
        # 先执行迁移（处理现有表）
        await migrate_db(conn)
        # 再创建新表（如果不存在）
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()
