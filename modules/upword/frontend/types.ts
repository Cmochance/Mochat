/**
 * Upword 类型定义
 */

/** 模块配置 */
export interface UpwordConfig {
  apiBase: string
  folder?: string
  userId?: string
  maxSizeMB?: number
}

/** 预签名请求 */
export interface PresignRequest {
  filename: string
  contentType: string
  folder?: string
  userId?: string
}

/** 预签名响应 */
export interface PresignResponse {
  uploadUrl: string
  key: string
  publicUrl: string
}

/** 解析请求 */
export interface ParseRequest {
  objectKey: string
}

/** 解析响应 */
export interface ParseResponse {
  success: boolean
  markdown?: string
  error?: string
}

/** 上传结果 */
export interface UploadResult {
  key: string
  url: string
  markdown: string
}

/** 文档预览 */
export interface DocPreview {
  file: File
  name: string
}

/** 上传状态 */
export interface UploadState {
  isUploading: boolean
  isParsing: boolean
  progress: 'idle' | 'uploading' | 'parsing' | 'done' | 'error'
  error: string | null
}
