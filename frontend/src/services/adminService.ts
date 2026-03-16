import api from './api'
import type {
  User,
  SystemStats,
  RestrictedKeyword,
  UsageStats,
  TierInfo,
  UsageEventsResponse,
} from '../types'

export interface UsageStatsQuery {
  start_at?: string
  end_at?: string
  action?: 'chat' | 'image' | 'ppt'
  status?: 'success' | 'failed'
  q?: string
  page?: number
  page_size?: number
}

export interface UsageEventsQuery extends UsageStatsQuery {
  user_id?: number
}

export interface MCPServerConfig {
  id: number
  name: string
  transport: 'remote' | 'stdio' | string
  is_active: boolean
  base_url?: string | null
  command?: string | null
  args_json?: string | null
  env_json?: string | null
  headers_json?: string | null
  timeout_ms?: number
  retry_count?: number
  tool_count?: number
  created_at?: string | null
  updated_at?: string | null
}

export interface MCPToolConfig {
  tool_name: string
  description: string
  input_schema?: Record<string, unknown>
  is_enabled: boolean
  requires_approval: boolean
  updated_at?: string | null
}

export interface MCPResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPPromptInfo {
  name: string
  description?: string
  arguments?: Array<Record<string, unknown>>
}

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

  // 获取用户密码（仅管理员可用）
  async getUserPassword(userId: number): Promise<string> {
    const response = await api.get<{ password: string }>(`/admin/users/${userId}/password`)
    return response.data.password
  },

  // 获取配置
  async getConfigs(): Promise<Record<string, string>> {
    const response = await api.get<Record<string, string>>('/admin/config')
    return response.data
  },

  // 设置配置
  async setConfig(key: string, value: string): Promise<void> {
    await api.put(`/admin/config/${key}`, { value })
  },

  // ============ 限制词管理 ============

  // 获取所有限制词
  async getKeywords(): Promise<RestrictedKeyword[]> {
    const response = await api.get<RestrictedKeyword[]>('/admin/keywords')
    return response.data
  },

  // 添加限制词
  async addKeyword(keyword: string): Promise<RestrictedKeyword> {
    const response = await api.post<RestrictedKeyword>('/admin/keywords', { keyword })
    return response.data
  },

  // 删除限制词
  async deleteKeyword(keywordId: number): Promise<void> {
    await api.delete(`/admin/keywords/${keywordId}`)
  },

  // 切换限制词状态
  async toggleKeywordStatus(keywordId: number): Promise<RestrictedKeyword> {
    const response = await api.post<RestrictedKeyword>(`/admin/keywords/${keywordId}/toggle`)
    return response.data
  },

  // ============ 模型管理 ============

  // 获取所有允许的模型
  async getAllowedModels(): Promise<AllowedModel[]> {
    const response = await api.get<AllowedModel[]>('/admin/models')
    return response.data
  },

  // 添加允许的模型
  async addAllowedModel(modelId: string, displayName?: string, sortOrder?: number): Promise<AllowedModel> {
    const response = await api.post<AllowedModel>('/admin/models', {
      model_id: modelId,
      display_name: displayName,
      sort_order: sortOrder ?? 0,
    })
    return response.data
  },

  // 删除允许的模型
  async deleteAllowedModel(modelDbId: number): Promise<void> {
    await api.delete(`/admin/models/${modelDbId}`)
  },

  // 切换模型状态
  async toggleModelStatus(modelDbId: number): Promise<AllowedModel> {
    const response = await api.post<AllowedModel>(`/admin/models/${modelDbId}/toggle`)
    return response.data
  },

  // 更新模型排序
  async updateModelSort(modelDbId: number, sortOrder: number): Promise<AllowedModel> {
    const response = await api.put<AllowedModel>(`/admin/models/${modelDbId}/sort`, {
      sort_order: sortOrder,
    })
    return response.data
  },

  // ============ 用户等级管理 ============

  // 更新用户等级
  async updateUserTier(userId: number, tier: string): Promise<User> {
    const response = await api.put<User>(`/admin/users/${userId}/tier`, { tier })
    return response.data
  },

  // 获取等级配置信息
  async getTierInfo(): Promise<{ tiers: TierInfo[] }> {
    const response = await api.get<{ tiers: TierInfo[] }>('/admin/tiers')
    return response.data
  },

  // ============ 使用量统计 ============

  // 获取所有用户使用量统计
  async getUsageStats(query: UsageStatsQuery = {}): Promise<UsageStats[]> {
    const response = await api.get<UsageStats[]>('/admin/usage/stats', {
      params: query,
    })
    return response.data
  },

  // 获取使用量事件流水
  async getUsageEvents(query: UsageEventsQuery = {}): Promise<UsageEventsResponse> {
    const response = await api.get<UsageEventsResponse>('/admin/usage/events', {
      params: query,
    })
    return response.data
  },

  // 导出使用量事件 CSV
  async exportUsageEvents(query: UsageEventsQuery = {}): Promise<void> {
    const response = await api.get<Blob>('/admin/usage/export', {
      params: query,
      responseType: 'blob',
    })

    const disposition = response.headers['content-disposition'] as string | undefined
    const defaultName = `usage_events_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    const fileNameMatch = disposition?.match(/filename=([^;]+)/i)
    const filename = fileNameMatch ? fileNameMatch[1].replace(/\"/g, '').trim() : defaultName

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  // 触发统计对账
  async reconcileUsage(userId?: number): Promise<{
    generated_at: string
    summary: {
      users_checked: number
      user_total_mismatches: number
      aggregate_mismatches: number
    }
  }> {
    const response = await api.get('/admin/usage/reconcile', {
      params: userId ? { user_id: userId } : undefined,
    })
    return response.data
  },

  // ============ MCP 管理 ============
  async getMcpServers(): Promise<MCPServerConfig[]> {
    const response = await api.get<MCPServerConfig[]>('/admin/mcp/servers')
    return response.data
  },

  async createMcpServer(payload: {
    name: string
    transport: 'remote' | 'stdio'
    is_active?: boolean
    base_url?: string
    command?: string
    args_json?: string
    env_json?: string
    headers_json?: string
    timeout_ms?: number
    retry_count?: number
    bearer_token?: string
  }): Promise<void> {
    await api.post('/admin/mcp/servers', payload)
  },

  async updateMcpServer(serverId: number, payload: Partial<{
    name: string
    transport: 'remote' | 'stdio'
    is_active: boolean
    base_url: string
    command: string
    args_json: string
    env_json: string
    headers_json: string
    timeout_ms: number
    retry_count: number
    bearer_token: string
    clear_bearer_token: boolean
  }>): Promise<void> {
    await api.put(`/admin/mcp/servers/${serverId}`, payload)
  },

  async deleteMcpServer(serverId: number): Promise<void> {
    await api.delete(`/admin/mcp/servers/${serverId}`)
  },

  async testMcpServer(serverId: number): Promise<{ success: boolean; latency_ms: number; tools: number }> {
    const response = await api.post(`/admin/mcp/servers/${serverId}/test`)
    return response.data
  },

  async refreshMcpTools(serverId: number): Promise<{ count: number; tools: Array<Record<string, unknown>> }> {
    const response = await api.post(`/admin/mcp/servers/${serverId}/refresh-tools`)
    return response.data
  },

  async getMcpTools(serverId: number): Promise<MCPToolConfig[]> {
    const response = await api.get<MCPToolConfig[]>(`/admin/mcp/servers/${serverId}/tools`)
    return response.data
  },

  async updateMcpToolFlags(
    serverId: number,
    toolName: string,
    payload: { is_enabled?: boolean; requires_approval?: boolean }
  ): Promise<void> {
    await api.put(`/admin/mcp/servers/${serverId}/tools/${encodeURIComponent(toolName)}`, payload)
  },

  async getMcpResources(serverId: number): Promise<MCPResourceInfo[]> {
    const response = await api.get<MCPResourceInfo[]>(`/admin/mcp/servers/${serverId}/resources`)
    return response.data
  },

  async readMcpResource(serverId: number, uri: string): Promise<Record<string, unknown>> {
    const response = await api.post(`/admin/mcp/servers/${serverId}/resources/read`, { uri })
    return response.data
  },

  async getMcpPrompts(serverId: number): Promise<MCPPromptInfo[]> {
    const response = await api.get<MCPPromptInfo[]>(`/admin/mcp/servers/${serverId}/prompts`)
    return response.data
  },

  async getMcpPrompt(
    serverId: number,
    name: string,
    argumentsPayload: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const response = await api.post(`/admin/mcp/servers/${serverId}/prompts/get`, {
      name,
      arguments: argumentsPayload,
    })
    return response.data
  },

  async getMcpRuns(query: {
    request_id?: string
    user_id?: number
    page?: number
    page_size?: number
  } = {}): Promise<{
    total: number
    page: number
    page_size: number
    items: Array<Record<string, unknown>>
  }> {
    const response = await api.get('/admin/mcp/runs', { params: query })
    return response.data
  },
}

// 允许的模型类型
export interface AllowedModel {
  id: number
  model_id: string
  display_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string | null
}
