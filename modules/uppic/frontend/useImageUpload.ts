/**
 * Uppic 图片上传 Hook
 * 独立的图片上传逻辑，通过 API 与 Uppic 服务交互
 */
import { useState, useCallback } from 'react'
import type { UppicConfig, UploadResult, PresignResponse } from './types'

const DEFAULT_CONFIG: Required<UppicConfig> = {
  apiBase: '/uppic',
  folder: 'chat-images',
  userId: 'anonymous',
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxSize: 10 * 1024 * 1024, // 10MB
}

export function useImageUpload(config: UppicConfig = {}) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  /**
   * 验证图片文件
   */
  const validateImage = useCallback((file: File): { valid: boolean; error?: string } => {
    if (!finalConfig.allowedTypes.includes(file.type)) {
      return { valid: false, error: '仅支持 JPEG, PNG, GIF, WebP 格式的图片' }
    }
    if (file.size > finalConfig.maxSize) {
      const maxMB = finalConfig.maxSize / (1024 * 1024)
      return { valid: false, error: `图片大小不能超过 ${maxMB}MB` }
    }
    return { valid: true }
  }, [finalConfig.allowedTypes, finalConfig.maxSize])

  /**
   * 上传图片
   */
  const uploadImage = useCallback(async (file: File): Promise<UploadResult | null> => {
    // 验证
    const validation = validateImage(file)
    if (!validation.valid) {
      setError(validation.error || '验证失败')
      return null
    }

    setIsUploading(true)
    setError(null)

    try {
      // 1. 获取预签名 URL
      const signResponse = await fetch(`${finalConfig.apiBase}/api/upload/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          folder: finalConfig.folder,
          userId: finalConfig.userId,
        }),
      })

      if (!signResponse.ok) {
        const err = await signResponse.json().catch(() => ({}))
        throw new Error(err.detail || '获取上传地址失败')
      }

      const { uploadUrl, key, publicUrl }: PresignResponse = await signResponse.json()

      // 2. 直接上传到 R2
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error('上传到存储服务失败')
      }

      return { url: publicUrl, key }
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败'
      setError(message)
      return null
    } finally {
      setIsUploading(false)
    }
  }, [finalConfig, validateImage])

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    uploadImage,
    validateImage,
    isUploading,
    error,
    clearError,
  }
}
