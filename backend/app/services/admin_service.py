"""
管理业务服务 - 处理后台管理相关的业务逻辑
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import crud
from ..db.models import User


class AdminService:
    """管理业务服务类"""
    
    @staticmethod
    async def get_system_stats(db: AsyncSession) -> Dict[str, Any]:
        """获取系统统计信息"""
        user_count = await crud.get_user_count(db)
        session_count = await crud.get_session_count(db)
        message_count = await crud.get_message_count(db)
        
        return {
            "user_count": user_count,
            "session_count": session_count,
            "message_count": message_count
        }
    
    @staticmethod
    async def get_all_users(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> List[User]:
        """获取所有用户"""
        return await crud.get_all_users(db, skip, limit)
    
    @staticmethod
    async def update_user(
        db: AsyncSession,
        user_id: int,
        **kwargs
    ) -> Optional[User]:
        """更新用户信息"""
        # 过滤掉不允许修改的字段
        allowed_fields = {"username", "email", "role", "is_active"}
        update_data = {k: v for k, v in kwargs.items() if k in allowed_fields}
        
        if not update_data:
            return await crud.get_user_by_id(db, user_id)
        
        return await crud.update_user(db, user_id, **update_data)
    
    @staticmethod
    async def delete_user(
        db: AsyncSession,
        user_id: int,
        current_admin_id: int
    ) -> tuple[bool, Optional[str]]:
        """
        删除用户
        返回: (success, error_message)
        """
        if user_id == current_admin_id:
            return False, "不能删除自己的账号"
        
        user = await crud.get_user_by_id(db, user_id)
        if not user:
            return False, "用户不存在"
        
        success = await crud.delete_user(db, user_id)
        return success, None if success else "删除失败"
    
    @staticmethod
    async def toggle_user_status(
        db: AsyncSession,
        user_id: int,
        current_admin_id: int
    ) -> tuple[Optional[User], Optional[str]]:
        """
        切换用户状态（启用/禁用）
        返回: (user, error_message)
        """
        if user_id == current_admin_id:
            return None, "不能禁用自己的账号"
        
        user = await crud.get_user_by_id(db, user_id)
        if not user:
            return None, "用户不存在"
        
        updated_user = await crud.update_user(db, user_id, is_active=not user.is_active)
        return updated_user, None
    
    @staticmethod
    async def get_config(db: AsyncSession, key: str) -> Optional[str]:
        """获取系统配置"""
        return await crud.get_config(db, key)
    
    @staticmethod
    async def set_config(db: AsyncSession, key: str, value: str) -> bool:
        """设置系统配置"""
        await crud.set_config(db, key, value)
        return True
    
    @staticmethod
    async def get_all_configs(db: AsyncSession) -> Dict[str, str]:
        """获取所有系统配置"""
        # 这里可以扩展为从数据库获取所有配置
        configs = {}
        for key in ["ai_model", "ai_base_url", "max_tokens", "temperature"]:
            value = await crud.get_config(db, key)
            if value:
                configs[key] = value
        return configs


# 创建全局实例
admin_service = AdminService()
