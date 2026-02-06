import api from './api'
import type { UserUsage } from '../types'

export const userService = {
  // 获取当前用户使用量
  async getUsage(): Promise<UserUsage> {
    const response = await api.get<UserUsage>('/user/usage')
    return response.data
  },

  // 检查对话限额
  async checkChatLimit(): Promise<{ allowed: boolean; message: string }> {
    const response = await api.get<{ allowed: boolean; message: string }>('/user/usage/check-chat')
    return response.data
  },

  // 检查生图限额
  async checkImageLimit(): Promise<{ allowed: boolean; message: string }> {
    const response = await api.get<{ allowed: boolean; message: string }>('/user/usage/check-image')
    return response.data
  },

  // 增加生图使用计数
  async incrementImageUsage(): Promise<{ success: boolean }> {
    const response = await api.post<{ success: boolean }>('/user/usage/increment-image')
    return response.data
  },
}
