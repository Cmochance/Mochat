"""
管理API路由 - 处理后台管理请求
"""
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db import crud
from ..schemas.user import UserResponse, UserUpdate, UserAdminResponse
from ..services.admin_service import admin_service
from ..services.content_filter import content_filter
from ..core.dependencies import get_admin_user
from ..db.models import User

router = APIRouter()


# ============ Schemas ============

class KeywordCreate(BaseModel):
    keyword: str


class KeywordResponse(BaseModel):
    id: int
    keyword: str
    is_active: bool
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("/stats")
async def get_system_stats(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """获取系统统计信息"""
    return await admin_service.get_system_stats(db)


@router.get("/users", response_model=List[UserAdminResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """获取所有用户列表（包含密码哈希用于调试）"""
    return await admin_service.get_all_users(db, skip, limit)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update_data: UserUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新用户信息"""
    update_dict = update_data.model_dump(exclude_unset=True)
    user = await admin_service.update_user(db, user_id, **update_dict)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除用户"""
    success, error = await admin_service.delete_user(db, user_id, current_user.id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return {"message": "删除成功"}


@router.post("/users/{user_id}/toggle-status", response_model=UserResponse)
async def toggle_user_status(
    user_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换用户状态（启用/禁用）"""
    user, error = await admin_service.toggle_user_status(db, user_id, current_user.id)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return user


@router.get("/config")
async def get_configs(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, str]:
    """获取系统配置"""
    return await admin_service.get_all_configs(db)


class ConfigUpdate(BaseModel):
    value: str


@router.put("/config/{key}")
async def set_config(
    key: str,
    data: ConfigUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """设置系统配置"""
    await admin_service.set_config(db, key, data.value)
    await db.commit()
    return {"message": "配置更新成功"}


# ============ 限制词管理 ============

@router.get("/keywords")
async def get_keywords(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """获取所有限制词"""
    keywords = await crud.get_all_keywords(db)
    return [
        {
            "id": k.id,
            "keyword": k.keyword,
            "is_active": k.is_active,
            "created_at": k.created_at.isoformat() if k.created_at else None
        }
        for k in keywords
    ]


@router.post("/keywords")
async def add_keyword(
    data: KeywordCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """添加限制词"""
    keyword = data.keyword.strip()
    if not keyword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="关键词不能为空"
        )
    
    result = await crud.add_keyword(db, keyword, current_user.id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="关键词已存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {
        "id": result.id,
        "keyword": result.keyword,
        "is_active": result.is_active,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.delete("/keywords/{keyword_id}")
async def delete_keyword(
    keyword_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除限制词"""
    success = await crud.delete_keyword(db, keyword_id)
    await db.commit()
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="关键词不存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {"message": "删除成功"}


@router.post("/keywords/{keyword_id}/toggle")
async def toggle_keyword(
    keyword_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换限制词状态"""
    result = await crud.toggle_keyword_status(db, keyword_id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="关键词不存在"
        )
    
    # 使缓存失效
    content_filter.invalidate_cache()
    
    return {
        "id": result.id,
        "keyword": result.keyword,
        "is_active": result.is_active,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


# ============ 模型管理 ============

class ModelCreate(BaseModel):
    model_id: str
    display_name: str = None
    sort_order: int = 0


class ModelSortUpdate(BaseModel):
    sort_order: int


@router.get("/models")
async def get_allowed_models(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """获取所有配置的模型"""
    models = await crud.get_all_allowed_models(db)
    return [
        {
            "id": m.id,
            "model_id": m.model_id,
            "display_name": m.display_name,
            "is_active": m.is_active,
            "sort_order": m.sort_order,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in models
    ]


@router.post("/models")
async def add_model(
    data: ModelCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """添加允许的模型"""
    model_id = data.model_id.strip()
    if not model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型ID不能为空"
        )
    
    result = await crud.add_allowed_model(
        db, 
        model_id, 
        data.display_name.strip() if data.display_name else None,
        data.sort_order
    )
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该模型已存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.delete("/models/{model_db_id}")
async def delete_model(
    model_db_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """删除允许的模型"""
    success = await crud.delete_allowed_model(db, model_db_id)
    await db.commit()
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {"message": "删除成功"}


@router.post("/models/{model_db_id}/toggle")
async def toggle_model(
    model_db_id: int,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """切换模型启用状态"""
    result = await crud.toggle_model_status(db, model_db_id)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }


@router.put("/models/{model_db_id}/sort")
async def update_model_sort(
    model_db_id: int,
    data: ModelSortUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """更新模型排序"""
    result = await crud.update_model_sort_order(db, model_db_id, data.sort_order)
    await db.commit()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模型不存在"
        )
    
    return {
        "id": result.id,
        "model_id": result.model_id,
        "display_name": result.display_name,
        "is_active": result.is_active,
        "sort_order": result.sort_order,
        "created_at": result.created_at.isoformat() if result.created_at else None
    }
