/**
 * Uppic 类型定义
 */

export interface PresignRequest {
  filename: string
  contentType: string
  folder?: string
  userId?: string
}

export interface PresignResponse {
  uploadUrl: string
  key: string
  publicUrl: string
}

export interface UploadResult {
  url: string
  key: string
}

export interface UploadState {
  isUploading: boolean
  progress: number
  error: string | null
}

export interface ImagePreview {
  file: File
  previewUrl: string
}

export interface UppicConfig {
  /** Uppic 服务地址，默认 /uppic */
  apiBase?: string
  /** 存储文件夹 */
  folder?: string
  /** 用户ID */
  userId?: string
  /** 允许的文件类型 */
  allowedTypes?: string[]
  /** 最大文件大小 (字节) */
  maxSize?: number
}
