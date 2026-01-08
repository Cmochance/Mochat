import api from './api'
import type { LoginRequest, RegisterRequest, LoginResponse, User } from '../types'

// 发送验证码响应类型
interface SendCodeResponse {
  success: boolean
  message: string
  expires_in: number
  cooldown: number
}

// 注册请求类型（包含验证码）
interface RegisterWithCodeRequest extends RegisterRequest {
  code: string
}

// 重置密码请求类型
interface ResetPasswordRequest {
  email: string
  code: string
  new_password: string
}

export const authService = {
  // 登录
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', data)
    return response.data
  },

  // 注册（需要验证码）
  async register(data: RegisterWithCodeRequest): Promise<User> {
    const response = await api.post<User>('/auth/register', data)
    return response.data
  },

  // 登出
  async logout(): Promise<void> {
    await api.post('/auth/logout')
  },

  // 获取当前用户信息
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  // 修改密码
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', {
      old_password: oldPassword,
      new_password: newPassword,
    })
  },

  // 发送验证码
  async sendVerificationCode(email: string, purpose: 'register' | 'reset_password'): Promise<SendCodeResponse> {
    const response = await api.post<SendCodeResponse>('/verify/send', {
      email,
      purpose,
    })
    return response.data
  },

  // 获取验证码冷却时间
  async getCodeCooldown(email: string, purpose: 'register' | 'reset_password'): Promise<{ cooldown: number; can_send: boolean }> {
    const response = await api.get<{ cooldown: number; can_send: boolean }>('/verify/cooldown', {
      params: { email, purpose },
    })
    return response.data
  },

  // 重置密码
  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    await api.post('/auth/reset-password', data)
  },
}
