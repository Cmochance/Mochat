/**
 * Upword 文档上传按钮组件
 */
import React, { useRef } from 'react'
import { useDocUpload } from './useDocUpload'
import type { UpwordConfig, UploadResult } from './types'

interface DocUploadButtonProps {
  config: UpwordConfig
  onUploadComplete?: (result: UploadResult) => void
  onError?: (error: string) => void
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

export function DocUploadButton({
  config,
  onUploadComplete,
  onError,
  disabled = false,
  className = '',
  children,
}: DocUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const {
    uploadAndParse,
    validateDoc,
    isProcessing,
    progress,
    error,
  } = useDocUpload(config)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // 验证
    const validation = validateDoc(file)
    if (!validation.valid) {
      onError?.(validation.error || '文件验证失败')
      return
    }

    // 上传并解析
    const result = await uploadAndParse(file)
    if (result) {
      onUploadComplete?.(result)
    } else if (error) {
      onError?.(error)
    }
  }

  const triggerFileInput = () => {
    if (!disabled && !isProcessing) {
      fileInputRef.current?.click()
    }
  }

  // 获取进度文本
  const getProgressText = () => {
    switch (progress) {
      case 'uploading':
        return '上传中...'
      case 'parsing':
        return '解析中...'
      default:
        return null
    }
  }

  const progressText = getProgressText()

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isProcessing}
      />
      
      <button
        type="button"
        onClick={triggerFileInput}
        disabled={disabled || isProcessing}
        className={className}
        title="上传 Word 文档"
      >
        {isProcessing && progressText ? progressText : children}
      </button>
    </>
  )
}
