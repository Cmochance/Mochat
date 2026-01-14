import api from './api'
import type { User, SystemStats, RestrictedKeyword } from '../types'

export const adminService = {
  // 获取系统统计
  async getStats(): Promise<SystemStats> {
    const response = await api.get<SystemStats>('/admin/stats')
    return response.data
  },

  // 获取所有用户
  async getUsers(skip: number = 0, limit: number = 100): Promise<User[]> {
    const response = await api.get<User[]>('/admin/users', {
      params: { skip, limit },
    })
    return response.data
  },

  // 更新用户
  async updateUser(userId: number, data: Partial<User>): Promise<User> {
    const response = await api.put<User>(`/admin/users/${userId}`, data)
    return response.data
  },

  // 删除用户
  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/admin/users/${userId}`)
  },

  // 切换用户状态
  async toggleUserStatus(userId: number): Promise<User> {
    const response = await api.post<User>(`/admin/users/${userId}/toggle-status`)
    return response.data
  },

  // 获取用户密码（仅管理员可用）
  async getUserPassword(userId: number): Promise<string> {
    const response = await api.get<{ password: string }>(`/admin/users/${userId}/password`)
    return response.data.password
  },

  // 获取配置
  async getConfigs(): Promise<Record<string, string>> {
    const response = await api.get<Record<string, string>>('/admin/config')
    return response.data
  },

  // 设置配置
  async setConfig(key: string, value: string): Promise<void> {
    await api.put(`/admin/config/${key}`, { value })
  },

  // ============ 限制词管理 ============

  // 获取所有限制词
  async getKeywords(): Promise<RestrictedKeyword[]> {
    const response = await api.get<RestrictedKeyword[]>('/admin/keywords')
    return response.data
  },

  // 添加限制词
  async addKeyword(keyword: string): Promise<RestrictedKeyword> {
    const response = await api.post<RestrictedKeyword>('/admin/keywords', { keyword })
    return response.data
  },

  // 删除限制词
  async deleteKeyword(keywordId: number): Promise<void> {
    await api.delete(`/admin/keywords/${keywordId}`)
  },

  // 切换限制词状态
  async toggleKeywordStatus(keywordId: number): Promise<RestrictedKeyword> {
    const response = await api.post<RestrictedKeyword>(`/admin/keywords/${keywordId}/toggle`)
    return response.data
  },

  // ============ 模型管理 ============

  // 获取所有允许的模型
  async getAllowedModels(): Promise<AllowedModel[]> {
    const response = await api.get<AllowedModel[]>('/admin/models')
    return response.data
  },

  // 添加允许的模型
  async addAllowedModel(modelId: string, displayName?: string, sortOrder?: number): Promise<AllowedModel> {
    const response = await api.post<AllowedModel>('/admin/models', {
      model_id: modelId,
      display_name: displayName,
      sort_order: sortOrder ?? 0,
    })
    return response.data
  },

  // 删除允许的模型
  async deleteAllowedModel(modelDbId: number): Promise<void> {
    await api.delete(`/admin/models/${modelDbId}`)
  },

  // 切换模型状态
  async toggleModelStatus(modelDbId: number): Promise<AllowedModel> {
    const response = await api.post<AllowedModel>(`/admin/models/${modelDbId}/toggle`)
    return response.data
  },

  // 更新模型排序
  async updateModelSort(modelDbId: number, sortOrder: number): Promise<AllowedModel> {
    const response = await api.put<AllowedModel>(`/admin/models/${modelDbId}/sort`, {
      sort_order: sortOrder,
    })
    return response.data
  },
}

// 允许的模型类型
export interface AllowedModel {
  id: number
  model_id: string
  display_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string | null
}
