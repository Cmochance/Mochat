import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserUsage } from '../types'
import api, { setAccessToken, setRefreshToken } from '../services/api'

/** 判断是否为桌面环境 */
const isDesktop = (): boolean => {
  try {
    return !!(window as any).electronAPI
  } catch {
    return false
  }
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  usage: UserUsage | null
  isAuthenticated: boolean

  // Actions
  setAuth: (token: string, refreshToken: string | null, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
  setUsage: (usage: UserUsage) => void
  updateUsage: (updates: Partial<UserUsage>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      usage: null,
      isAuthenticated: false,

      setAuth: (token, refreshToken, user) => {
        // Web 端: access token 存内存（不写 localStorage），refresh token 由 HttpOnly Cookie 管理
        // 桌面端: 保持原有 localStorage 方式
        if (isDesktop()) {
          localStorage.setItem('token', token)
          if (refreshToken) {
            localStorage.setItem('refresh_token', refreshToken)
          } else {
            localStorage.removeItem('refresh_token')
          }
        } else {
          // Web 端仅存内存
          setAccessToken(token)
          // Supabase 模式会返回 refresh_token，存入内存供刷新使用
          if (refreshToken) {
            setRefreshToken(refreshToken)
          }
        }

        set({ token, refreshToken, user, isAuthenticated: true })
      },

      logout: () => {
        // 调用后端登出接口清除 HttpOnly Cookie（Web 端）
        if (!isDesktop()) {
          api.post('/auth/logout', null, { withCredentials: true }).catch(() => {})
        }
        // 清除所有本地存储
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('auth-storage')
        setAccessToken(null)
        setRefreshToken(null)

        set({ token: null, refreshToken: null, user: null, usage: null, isAuthenticated: false })
      },

      updateUser: (userData) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }))
      },

      setUsage: (usage) => {
        set({ usage })
      },

      updateUsage: (updates) => {
        set((state) => ({
          usage: state.usage ? { ...state.usage, ...updates } : null,
        }))
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => {
        // Web 端不持久化 token（安全改进）
        // 桌面端保留完整持久化
        if (isDesktop()) {
          return {
            token: state.token,
            refreshToken: state.refreshToken,
            user: state.user,
            isAuthenticated: state.isAuthenticated,
          }
        }
        // Web 端: 仅持久化用户信息和认证状态
        // 页面刷新后需要通过 refresh token（Cookie）自动恢复 access token
        return {
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }
      },
    }
  )
)
