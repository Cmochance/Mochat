/**
 * Uppic 图片上传按钮组件
 * 独立、可复用的图片上传 UI 组件
 */
import React, { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useImageUpload } from './useImageUpload'
import type { UppicConfig, ImagePreview, UploadResult } from './types'

export interface ImageUploadButtonProps {
  /** Uppic 配置 */
  config?: UppicConfig
  /** 上传成功回调 */
  onUploadSuccess?: (result: UploadResult) => void
  /** 上传失败回调 */
  onUploadError?: (error: string) => void
  /** 图片选择回调（选中但未上传） */
  onImageSelect?: (preview: ImagePreview) => void
  /** 取消选择回调 */
  onImageRemove?: () => void
  /** 是否禁用 */
  disabled?: boolean
  /** 自定义类名 */
  className?: string
  /** 自定义按钮内容 */
  children?: React.ReactNode
  /** 是否显示预览 */
  showPreview?: boolean
  /** 是否自动上传（选择后立即上传） */
  autoUpload?: boolean
}

export function ImageUploadButton({
  config,
  onUploadSuccess,
  onUploadError,
  onImageSelect,
  onImageRemove,
  disabled = false,
  className = '',
  children,
  showPreview = true,
  autoUpload = false,
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImagePreview | null>(null)
  const { uploadImage, validateImage, isUploading, error, clearError } = useImageUpload(config)

  // 清理预览 URL
  useEffect(() => {
    return () => {
      if (preview?.previewUrl) {
        URL.revokeObjectURL(preview.previewUrl)
      }
    }
  }, [preview])

  // 错误回调
  useEffect(() => {
    if (error && onUploadError) {
      onUploadError(error)
    }
  }, [error, onUploadError])

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证
    const validation = validateImage(file)
    if (!validation.valid) {
      onUploadError?.(validation.error || '文件验证失败')
      return
    }

    // 创建预览
    const previewUrl = URL.createObjectURL(file)
    const newPreview = { file, previewUrl }
    setPreview(newPreview)
    onImageSelect?.(newPreview)
    clearError()

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // 自动上传
    if (autoUpload) {
      const result = await uploadImage(file)
      if (result) {
        onUploadSuccess?.(result)
        removePreview()
      }
    }
  }

  const removePreview = () => {
    if (preview?.previewUrl) {
      URL.revokeObjectURL(preview.previewUrl)
    }
    setPreview(null)
    onImageRemove?.()
    clearError()
  }

  const triggerFileInput = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click()
    }
  }

  /**
   * 手动触发上传（当 autoUpload=false 时使用）
   * 可通过 ref 暴露给父组件调用
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const triggerUpload = async (): Promise<UploadResult | null> => {
    if (!preview) return null
    
    const result = await uploadImage(preview.file)
    if (result) {
      onUploadSuccess?.(result)
      removePreview()
    }
    return result
  }
  // TODO: 通过 useImperativeHandle 暴露 triggerUpload 给父组件
  void triggerUpload // 防止 TS 报未使用

  // 默认按钮样式（水墨风格）
  const defaultButtonStyle = `
    p-3 rounded-sm transition-colors duration-300
    ${!disabled && !isUploading
      ? 'bg-[#ebe7df] text-[#4a4a4a] hover:bg-[#d9d3c7] hover:text-[#1a1a1a] border-2 border-[#d9d3c7]'
      : 'bg-[#d9d3c7] text-[#8a8a8a] cursor-not-allowed border-2 border-[#d9d3c7]'
    }
  `

  return (
    <div className="uppic-container">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* 预览区域 */}
      {showPreview && preview && (
        <div className="uppic-preview mb-3 relative inline-block">
          <img
            src={preview.previewUrl}
            alt="预览"
            className="max-h-32 rounded-sm border-2 border-[#d9d3c7] shadow-sm"
          />
          <button
            onClick={removePreview}
            className="absolute -top-2 -right-2 p-1 bg-[#1a1a1a] text-[#f7f5f0] rounded-full shadow-md hover:bg-[#c73e3a] transition-colors w-5 h-5 flex items-center justify-center text-xs"
            type="button"
          >
            ×
          </button>
          {isUploading && (
            <div className="absolute inset-0 bg-[#1a1a1a]/50 rounded-sm flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#f7f5f0] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="uppic-error mb-2 text-sm text-[#c73e3a]">
          {error}
        </div>
      )}

      {/* 上传按钮 */}
      <button
        type="button"
        onClick={triggerFileInput}
        disabled={disabled || isUploading}
        className={className || defaultButtonStyle}
        title="上传图片"
      >
        {children || (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            <path d="M14 4v4M12 6h4" />
          </svg>
        )}
      </button>

      {/* 暴露 triggerUpload 方法给父组件 */}
      {/* 可通过 ref 或 context 获取 */}
    </div>
  )
}

// 导出 hook 以便高级用法
export { useImageUpload } from './useImageUpload'
export type { UppicConfig, UploadResult, ImagePreview } from './types'
