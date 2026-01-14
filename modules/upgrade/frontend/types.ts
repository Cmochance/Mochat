/**
 * Upgrade 模块类型定义
 */

// 版本历史条目
export interface VersionHistoryItem {
  version: string
  description: string
}

// 版本信息响应
export interface VersionInfo {
  current_version: string
  last_seen_version: string | null
  has_new_version: boolean
  version_history: VersionHistoryItem[]
}

// 版本确认请求
export interface VersionAckRequest {
  version: string
}

// 模块配置
export interface UpgradeConfig {
  // API 基础路径
  apiBasePath?: string
}
