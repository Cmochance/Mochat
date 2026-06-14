import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { clearAuthAndRedirect } from '../utils/auth'
import { getApiBaseUrl } from '../utils/env'

// 获取 API base URL（Web 模式为 '/api'，桌面模式为绝对地址）
const apiBaseUrl = getApiBaseUrl()

// 安全策略:
// - Access token 仅存储在内存中（不持久化到 localStorage）
// - Refresh token 通过 HttpOnly Cookie 自动传输（withCredentials）
// - 兼容桌面端 Electron 场景（桌面端仍使用 localStorage）

/** 内存中的 access token（页面刷新后丢失，需要通过 refresh 恢复） */
let memoryAccessToken: string | null = null

/** 内存中的 refresh token（仅 Supabase 模式使用，Legacy 模式走 HttpOnly Cookie） */
let memoryRefreshToken: string | null = null

/** 设置内存中的 access token */
export const setAccessToken = (token: string | null) => {
  memoryAccessToken = token
}

/** 设置内存中的 refresh token（Supabase 模式专用） */
export const setRefreshToken = (token: string | null) => {
  memoryRefreshToken = token
}

/** 获取内存中的 access token */
export const getAccessToken = (): string | null => {
  return memoryAccessToken
}

/** 判断是否为桌面环境 */
const isDesktop = (): boolean => {
  try {
    return !!(window as any).electronAPI
  } catch {
    return false
  }
}

/** 桌面端从 localStorage 读取 token（桌面端无 Cookie 域共享机制） */
const getDesktopToken = (): string | null => {
  return localStorage.getItem('token')
}

/** 获取有效 token：优先内存，桌面端回退到 localStorage */
const getEffectiveToken = (): string | null => {
  if (memoryAccessToken) return memoryAccessToken
  if (isDesktop()) return getDesktopToken()
  return null
}

// 创建 axios 实例
const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Web 模式下启用 withCredentials 以自动发送 HttpOnly Cookie
  withCredentials: !isDesktop(),
})

// 用于刷新 token 的独立客户端（避免拦截器递归）
const refreshClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: !isDesktop(),
})

let refreshPromise: Promise<string | null> | null = null

const requestTokenRefresh = async (): Promise<string | null> => {
  // 桌面端: 从 localStorage 读取 refresh_token 放入 body
  // Web 端: HttpOnly Cookie 由浏览器自动携带，body 留空
  if (isDesktop()) {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return null

    try {
      const response = await refreshClient.post('/auth/refresh', {
        refresh_token: refreshToken,
      })
      const data = response.data as {
        access_token?: string
        refresh_token?: string | null
      }
      if (!data?.access_token) return null

      localStorage.setItem('token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token)
      }
      return data.access_token
    } catch {
      return null
    }
  }

  // Web 端: refresh token 在 HttpOnly Cookie 中自动发送
  // Supabase 模式下 refresh token 不在 Cookie 中，需从内存取出放入请求体
  try {
    const body = memoryRefreshToken ? { refresh_token: memoryRefreshToken } : {}
    const response = await refreshClient.post('/auth/refresh', body)
    const data = response.data as {
      access_token?: string
      refresh_token?: string | null
    }
    if (!data?.access_token) return null

    // Supabase 模式会返回新的 refresh_token，更新内存
    if (data.refresh_token) {
      memoryRefreshToken = data.refresh_token
    }

    // 新 token 存入内存
    memoryAccessToken = data.access_token
    return data.access_token
  } catch {
    return null
  }
}

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getEffectiveToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理 401 错误并自动刷新 token
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
      if (!originalRequest) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }

      const requestUrl = originalRequest.url || ''
      const isRefreshRequest = requestUrl.includes('/auth/refresh')
      const isLoginOrRegisterRequest =
        requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')

      if (isLoginOrRegisterRequest) {
        return Promise.reject(error)
      }
      if (originalRequest._retry || isRefreshRequest) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }

      originalRequest._retry = true

      if (!refreshPromise) {
        refreshPromise = requestTokenRefresh().finally(() => {
          refreshPromise = null
        })
      }

      const nextToken = await refreshPromise
      if (!nextToken) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${nextToken}`
      }
      return api(originalRequest)
    }
    return Promise.reject(error)
  }
)

export default api
