// 用户类型
export interface User {
  id: number
  username: string
  email: string
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
  updated_at: string
  password_hash?: string  // 管理员接口返回，用于调试
}

// 认证相关
export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

// 会话类型
export interface ChatSession {
  id: number
  title: string
  created_at: string
  updated_at: string
}

// 消息类型
export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  created_at: string
}

// 流式响应块
export interface StreamChunk {
  type: 'thinking' | 'content' | 'done' | 'error'
  data: string
}

// API响应类型
export interface ApiResponse<T> {
  data?: T
  error?: string
}

// 系统统计
export interface SystemStats {
  user_count: number
  session_count: number
  message_count: number
  keyword_count: number
}

// 限制词
export interface RestrictedKeyword {
  id: number
  keyword: string
  is_active: boolean
  created_at: string
}

// 版本相关类型已移至 modules/upgrade/frontend/types.ts
