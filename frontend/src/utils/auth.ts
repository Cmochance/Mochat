/**
 * 认证工具函数
 */

import { setAccessToken } from '../services/api'

/**
 * 清除本地认证信息并跳转到登录页
 *
 * 安全策略:
 * - 清除内存中的 access token
 * - 清除 localStorage 中的所有认证数据
 * - HttpOnly Cookie 中的 refresh token 需要通过后端 /auth/logout 接口清除
 *   （前端无法直接操作 HttpOnly Cookie）
 */
export const clearAuthAndRedirect = () => {
  // 清除内存 token
  setAccessToken(null)

  // 清除 localStorage
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('auth-storage')

  // 跳转到登录页
  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login'
  }
}
