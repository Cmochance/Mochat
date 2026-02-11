// 用户类型
export interface User {
  id: number
  username: string
  email: string
  role: 'user' | 'admin'
  tier?: 'free' | 'pro' | 'plus'  // 用户等级
  is_active: boolean
  created_at: string
  updated_at: string
  password_hash?: string  // 管理员接口返回，用于调试
}

// 用户使用量
export interface UserUsage {
  tier: string
  tier_name_zh: string
  tier_name_en: string
  chat_limit: number
  chat_used: number
  chat_remaining: number
  image_limit: number
  image_used: number
  image_remaining: number
  is_unlimited: boolean
  reset_date: string | null
  total_chat_count?: number
  total_image_count?: number
  total_ppt_count?: number
  last_used_at?: string | null
}

// 使用量统计（管理员用）
export interface UsageStats {
  user_id: number
  username: string
  email: string
  role: string
  tier: string
  tier_name_zh: string
  tier_name_en: string
  chat_limit: number
  chat_used: number
  image_limit: number
  image_used: number
  ppt_used?: number
  chat_failed_today?: number
  image_failed_today?: number
  ppt_failed_today?: number
  chat_total_success?: number
  image_total_success?: number
  ppt_total_success?: number
  chat_total_failed?: number
  image_total_failed?: number
  ppt_total_failed?: number
  filtered_success_count?: number
  filtered_failed_count?: number
  last_used_at?: string | null
  is_unlimited: boolean
}

export interface UsageEvent {
  id: number
  user_id: number
  username: string
  email: string
  action: 'chat' | 'image' | 'ppt'
  status: 'success' | 'failed'
  request_id: string
  session_id: number | null
  amount: number
  error_code: string | null
  source: string
  occurred_at: string | null
  created_at: string | null
}

export interface UsageEventsResponse {
  total: number
  page: number
  page_size: number
  items: UsageEvent[]
}

// 等级信息
export interface TierInfo {
  id: string
  name_zh: string
  name_en: string
  chat_limit: number
  image_limit: number
}

// 认证相关
export interface LoginRequest {
  identifier?: string
  username?: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token?: string | null
  expires_in?: number | null
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

// 聊天输入模式
export type ChatMode = 'chat' | 'draw' | 'ppt'

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
