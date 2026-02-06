import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserUsage } from '../types'

interface AuthState {
  token: string | null
  user: User | null
  usage: UserUsage | null
  isAuthenticated: boolean
  
  // Actions
  setAuth: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
  setUsage: (usage: UserUsage) => void
  updateUsage: (updates: Partial<UserUsage>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      usage: null,
      isAuthenticated: false,

      setAuth: (token, user) => {
        localStorage.setItem('token', token)
        set({ token, user, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ token: null, user: null, usage: null, isAuthenticated: false })
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
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // 不持久化 usage，每次刷新时重新获取
      }),
    }
  )
)
