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
  const [progress, setProgress] = useState(0)
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
    setProgress(0)
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

      // 2. 使用 XMLHttpRequest 上传到 R2（支持进度回调）
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100)
            resolve()
          } else {
            reject(new Error('上传到存储服务失败'))
          }
        }

        xhr.onerror = () => reject(new Error('网络错误，上传失败'))
        xhr.onabort = () => reject(new Error('上传已取消'))

        xhr.send(file)
      })

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
    setProgress(0)
  }, [])

  return {
    uploadImage,
    validateImage,
    isUploading,
    progress,
    error,
    clearError,
  }
}
