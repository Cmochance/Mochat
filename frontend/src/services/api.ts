import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 用于刷新 token 的独立客户端（避免拦截器递归）
const refreshClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

let refreshPromise: Promise<string | null> | null = null

const clearAuthAndRedirect = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
  localStorage.removeItem('auth-storage')
  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login'
  }
}

const requestTokenRefresh = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) {
    return null
  }

  try {
    const response = await refreshClient.post('/auth/refresh', {
      refresh_token: refreshToken,
    })
    const data = response.data as {
      access_token?: string
      refresh_token?: string | null
    }

    if (!data?.access_token) {
      return null
    }

    localStorage.setItem('token', data.access_token)
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token)
    }
    return data.access_token
  } catch {
    return null
  }
}

// 请求拦截器 - 添加token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理错误
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
      const isLoginOrRegisterRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')

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
