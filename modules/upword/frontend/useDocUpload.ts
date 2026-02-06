/**
 * Upword Hook - 文档上传与解析
 */
import { useState, useCallback } from 'react'
import type {
  UpwordConfig,
  PresignRequest,
  PresignResponse,
  ParseResponse,
  UploadResult,
  UploadState,
} from './types'

// Word 文档 MIME 类型
const DOC_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// 默认配置
const DEFAULT_CONFIG: Partial<UpwordConfig> = {
  folder: 'documents',
  userId: 'anonymous',
  maxSizeMB: 20,
}

export function useDocUpload(config: UpwordConfig) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    isParsing: false,
    progress: 'idle',
    error: null,
  })

  /**
   * 验证文档文件
   */
  const validateDoc = useCallback((file: File): { valid: boolean; error?: string } => {
    // 检查文件类型
    const isDoc = DOC_MIME_TYPES.includes(file.type) ||
      file.name.toLowerCase().endsWith('.doc') ||
      file.name.toLowerCase().endsWith('.docx')
    
    if (!isDoc) {
      return { valid: false, error: '仅支持 .doc 和 .docx 格式' }
    }

    // 检查文件大小
    const maxBytes = (mergedConfig.maxSizeMB || 20) * 1024 * 1024
    if (file.size > maxBytes) {
      return { valid: false, error: `文件大小不能超过 ${mergedConfig.maxSizeMB}MB` }
    }

    return { valid: true }
  }, [mergedConfig.maxSizeMB])

  /**
   * 获取预签名 URL
   */
  const getPresignedUrl = async (file: File): Promise<PresignResponse | null> => {
    const request: PresignRequest = {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      folder: mergedConfig.folder,
      userId: mergedConfig.userId,
    }

    console.log('[Upword] 请求预签名 URL:', request)

    const response = await fetch(`${mergedConfig.apiBase}/api/upload/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      console.error('[Upword] 预签名失败:', error)
      throw new Error(error.detail || '获取上传链接失败')
    }

    const result = await response.json()
    console.log('[Upword] 预签名成功:', { key: result.key, publicUrl: result.publicUrl })
    return result
  }

  /**
   * 上传文件到 R2
   */
  const uploadToR2 = async (file: File, uploadUrl: string, contentType: string): Promise<void> => {
    console.log('[Upword] 开始上传到 R2:', { 
      fileName: file.name, 
      fileSize: file.size,
      contentType,
      uploadUrl: uploadUrl.substring(0, 100) + '...'
    })
    
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': contentType,
        },
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('[Upword] R2 上传失败:', response.status, errorText)
        throw new Error(`文件上传失败: ${response.status} ${response.statusText}`)
      }
      
      console.log('[Upword] R2 上传成功')
    } catch (error) {
      console.error('[Upword] R2 上传异常:', error)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('上传失败: 网络错误或 R2 CORS 未配置。请检查 R2 存储桶的 CORS 设置。')
      }
      throw error
    }
  }

  /**
   * 解析文档
   */
  const parseDocument = async (objectKey: string): Promise<ParseResponse> => {
    const response = await fetch(`${mergedConfig.apiBase}/api/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectKey }),
    })

    if (!response.ok) {
      throw new Error('文档解析请求失败')
    }

    return response.json()
  }

  /**
   * 完整的上传并解析流程
   */
  const uploadAndParse = useCallback(async (file: File): Promise<UploadResult | null> => {
    // 验证文件
    const validation = validateDoc(file)
    if (!validation.valid) {
      setState(s => ({ ...s, error: validation.error || '文件验证失败' }))
      return null
    }

    setState({
      isUploading: true,
      isParsing: false,
      progress: 'uploading',
      error: null,
    })

    try {
      // 1. 获取预签名 URL
      const presign = await getPresignedUrl(file)
      if (!presign) {
        throw new Error('获取上传链接失败')
      }

      // 2. 上传到 R2 (使用与预签名相同的 Content-Type)
      const contentType = file.type || 'application/octet-stream'
      await uploadToR2(file, presign.uploadUrl, contentType)

      setState(s => ({
        ...s,
        isUploading: false,
        isParsing: true,
        progress: 'parsing',
      }))

      // 3. 解析文档
      const parseResult = await parseDocument(presign.key)
      
      if (!parseResult.success) {
        throw new Error(parseResult.error || '文档解析失败')
      }

      setState({
        isUploading: false,
        isParsing: false,
        progress: 'done',
        error: null,
      })

      return {
        key: presign.key,
        url: presign.publicUrl,
        markdown: parseResult.markdown || '',
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传失败'
      setState({
        isUploading: false,
        isParsing: false,
        progress: 'error',
        error: errorMsg,
      })
      return null
    }
  }, [validateDoc, mergedConfig])

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null, progress: 'idle' }))
  }, [])

  return {
    uploadAndParse,
    validateDoc,
    clearError,
    isUploading: state.isUploading,
    isParsing: state.isParsing,
    isProcessing: state.isUploading || state.isParsing,
    progress: state.progress,
    error: state.error,
  }
}
