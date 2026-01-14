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
        
        # 检查 users 表是否存在
        if 'users' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('users')]
            
            # 添加 password_encrypted 列（如果不存在）
            if 'password_encrypted' not in columns:
                print("[Migration] Adding 'password_encrypted' column to users table...")
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN password_encrypted VARCHAR(500)"
                ))
                print("[Migration] Column 'password_encrypted' added successfully.")
            
            # 添加 last_seen_version 列（如果不存在）
            if 'last_seen_version' not in columns:
                print("[Migration] Adding 'last_seen_version' column to users table...")
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN last_seen_version VARCHAR(20)"
                ))
                print("[Migration] Column 'last_seen_version' added successfully.")
    
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
