import api from './api'
import type { User, SystemStats } from '../types'

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

  // 获取配置
  async getConfigs(): Promise<Record<string, string>> {
    const response = await api.get<Record<string, string>>('/admin/config')
    return response.data
  },

  // 设置配置
  async setConfig(key: string, value: string): Promise<void> {
    await api.put(`/admin/config/${key}`, value, {
      headers: { 'Content-Type': 'text/plain' },
    })
  },
}
