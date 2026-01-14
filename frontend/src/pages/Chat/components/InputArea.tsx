import { useState, useRef, useEffect, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ImagePlus, FileText, X, Loader2, ExternalLink, AlertCircle, ChevronUp, Cpu } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
// 从独立模块导入
import { useImageUpload, type ImagePreview } from '@uppic'
import { useDocUpload } from '@upword'

// 模型信息类型
export interface ModelInfo {
  id: string
  name: string
  owned_by?: string | null
}

interface InputAreaProps {
  onSend: (content: string, model?: string) => void
  disabled?: boolean
  models?: ModelInfo[]
  currentModel?: string
  defaultModel?: string
  onModelChange?: (model: string) => void
}

// Word 文档预览类型
interface DocPreview {
  file: File
  localUrl: string  // 本地 blob URL，用于下载
}

export default function InputArea({ 
  onSend, 
  disabled = false,
  models = [],
  currentModel,
  defaultModel,
  onModelChange,
}: InputAreaProps) {
  const [content, setContent] = useState('')
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const [docPreview, setDocPreview] = useState<DocPreview | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragFileType, setDragFileType] = useState<'image' | 'doc' | 'unknown'>('unknown')
  const [fileError, setFileError] = useState<string | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  // 获取显示的模型名称（优先使用自定义名称）
  const getModelDisplayName = (model: ModelInfo) => {
    // 优先使用后端返回的 name（可能是自定义名称），否则从 id 提取
    if (model.name && model.name !== model.id) {
      return model.name
    }
    // 从 id 提取简化名称
    const parts = model.id.split('/')
    return parts[parts.length - 1]
  }

  // 根据 ID 获取模型对象
  const getModelById = (modelId: string): ModelInfo | undefined => {
    return models.find(m => m.id === modelId)
  }

  // 当前显示的模型 ID
  const displayModelId = currentModel || defaultModel || (models[0]?.id)
  // 当前显示的模型对象
  const displayModelObj = displayModelId ? getModelById(displayModelId) : undefined
  
  const { user } = useAuthStore()
  
  // 使用 uppic 模块的 hook
  const { 
    uploadImage, 
    validateImage, 
    isUploading: isUploadingImage, 
    error: imageError, 
    clearError: clearImageError 
  } = useImageUpload({
    apiBase: '/uppic',
    folder: 'chat-images',
    userId: user?.id?.toString() || 'anonymous',
  })

  // 使用 upword 模块的 hook
  const {
    uploadAndParse,
    validateDoc,
    isProcessing: isProcessingDoc,
    progress: docProgress,
    error: docError,
    clearError: clearDocError,
  } = useDocUpload({
    apiBase: '/upword',
    folder: 'chat-docs',
    userId: user?.id?.toString() || 'anonymous',
  })

  const isProcessing = isUploadingImage || isProcessingDoc
  const error = imageError || docError || fileError

  // 清除文件错误
  const clearFileError = () => setFileError(null)

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }, [content])

  // 清理预览 URL
  useEffect(() => {
    return () => {
      if (imagePreview?.previewUrl) {
        URL.revokeObjectURL(imagePreview.previewUrl)
      }
      if (docPreview?.localUrl) {
        URL.revokeObjectURL(docPreview.localUrl)
      }
    }
  }, [imagePreview, docPreview])

  // 判断是否为 Word 文档
  const isWordDocument = (file: File): boolean => {
    const wordMimeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    const wordExtensions = ['.doc', '.docx']
    const fileName = file.name.toLowerCase()
    return wordMimeTypes.includes(file.type) || wordExtensions.some(ext => fileName.endsWith(ext))
  }

  // 处理图片选择
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processImageFile(file)
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  // 处理文档选择
  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processDocFile(file)
    if (docInputRef.current) {
      docInputRef.current.value = ''
    }
  }

  // 处理图片文件
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    
    const validation = validateImage(file)
    if (!validation.valid) return
    
    const previewUrl = URL.createObjectURL(file)
    setImagePreview({ file, previewUrl })
    clearImageError()
    clearFileError()
  }

  // 处理文档文件
  const processDocFile = (file: File) => {
    if (!isWordDocument(file)) return
    
    const validation = validateDoc(file)
    if (!validation.valid) return
    
    const localUrl = URL.createObjectURL(file)
    setDocPreview({ file, localUrl })
    clearDocError()
    clearFileError()
  }

  // 统一的文件处理函数（用于拖拽）
  const processFile = (file: File) => {
    clearFileError()
    if (file.type.startsWith('image/')) {
      processImageFile(file)
    } else if (isWordDocument(file)) {
      processDocFile(file)
    } else {
      setFileError('未知格式文件，请上传图片或Word文档')
      // 3秒后自动清除错误
      setTimeout(() => setFileError(null), 3000)
    }
  }

  // 检测拖拽文件类型
  const detectDragFileType = (e: DragEvent<HTMLDivElement>): 'image' | 'doc' | 'unknown' => {
    const items = e.dataTransfer.items
    if (!items || items.length === 0) return 'unknown'
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) return 'image'
      if (item.type === 'application/msword' || 
          item.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return 'doc'
      }
    }
    return 'unknown'
  }

  // 拖拽事件处理
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (!disabled && !isProcessing && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
      setDragFileType(detectDragFileType(e))
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
      setDragFileType('unknown')
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setDragFileType('unknown')
    dragCounterRef.current = 0

    if (disabled || isProcessing) return

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const file = files[0]
    processFile(file)
  }

  const removeImage = () => {
    if (imagePreview?.previewUrl) {
      URL.revokeObjectURL(imagePreview.previewUrl)
    }
    setImagePreview(null)
    clearImageError()
  }

  const removeDoc = () => {
    if (docPreview?.localUrl) {
      URL.revokeObjectURL(docPreview.localUrl)
    }
    setDocPreview(null)
    clearDocError()
  }

  // 打开文档（下载本地文件）
  const openDoc = () => {
    if (!docPreview) return
    
    // 使用本地 blob URL 触发下载
    const link = document.createElement('a')
    link.href = docPreview.localUrl
    link.download = docPreview.file.name  // 设置下载文件名
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSubmit = async () => {
    if ((!content.trim() && !imagePreview && !docPreview) || disabled || isProcessing) return

    let imageUrl: string | undefined
    let docInfo: { key: string; url: string; filename: string } | undefined

    // 如果有图片，通过 uppic 服务上传
    if (imagePreview) {
      const result = await uploadImage(imagePreview.file)
      if (result) {
        imageUrl = result.url
      } else {
        return // 上传失败，不发送消息
      }
    }

    // 如果有文档，通过 upword 服务上传并解析
    // 注意：这里只获取文档的 key 和 url，不获取 markdown 内容
    // markdown 内容会由后端在发送给 AI 时从 R2 获取
    if (docPreview) {
      const result = await uploadAndParse(docPreview.file)
      if (result) {
        // 只保存元数据，不保存 markdown 内容
        docInfo = {
          key: result.key,
          url: result.url,
          filename: docPreview.file.name,
        }
      } else {
        return // 上传/解析失败，不发送消息
      }
    }

    // 构建消息内容 - 只包含元数据，不包含文档实际内容
    let messageContent = content.trim()
    
    // 添加图片
    if (imageUrl) {
      const imageMarkdown = `![图片](${imageUrl})`
      messageContent = messageContent 
        ? `${messageContent}\n\n${imageMarkdown}` 
        : imageMarkdown
    }

    // 添加文档元数据（只包含文件名和 key，不包含内容）
    // 格式: <!-- DOC:filename.docx:key --><!-- /DOC -->
    // 后端会根据 key 从 R2 获取文档内容
    if (docInfo) {
      const docTag = `<!-- DOC:${docInfo.filename}:${docInfo.key} --><!-- /DOC -->`
      messageContent = messageContent
        ? `${messageContent}\n\n${docTag}`
        : docTag
    }

    onSend(messageContent, displayModelId)
    setContent('')
    removeImage()
    removeDoc()
  }

  // 点击外部关闭模型选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) {
        setShowModelPicker(false)
      }
    }
    
    if (showModelPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelPicker])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const triggerImageInput = () => {
    imageInputRef.current?.click()
  }

  const triggerDocInput = () => {
    docInputRef.current?.click()
  }

  const canSend = (content.trim() || imagePreview || docPreview) && !disabled && !isProcessing

  // 获取拖拽提示文本和图标
  const getDragHint = () => {
    switch (dragFileType) {
      case 'image':
        return { icon: ImagePlus, text: '释放以上传图片', isError: false }
      case 'doc':
        return { icon: FileText, text: '释放以上传文档', isError: false }
      default:
        return { icon: AlertCircle, text: '未知格式文件，请上传图片或Word文档', isError: true }
    }
  }

  const dragHint = getDragHint()
  const DragIcon = dragHint.icon

  return (
    <motion.div
      className={`
        border-t border-paper-aged bg-paper-white/80 backdrop-blur-sm p-4
        relative transition-all duration-200 flex-shrink-0
        ${isDragging ? 'ring-2 ring-ink-medium ring-inset bg-paper-cream/50' : ''}
      `}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 拖拽提示覆盖层 */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`
              absolute inset-0 flex items-center justify-center z-10 border-2 border-dashed rounded-sm pointer-events-none
              ${dragHint.isError 
                ? 'bg-red-50/95 border-vermilion' 
                : 'bg-paper-cream/95 border-ink-medium'
              }
            `}
          >
            <div className={`flex flex-col items-center gap-2 ${dragHint.isError ? 'text-vermilion' : 'text-ink-medium'}`}>
              <DragIcon size={32} className={dragHint.isError ? 'animate-pulse' : 'animate-bounce'} />
              <span className="text-lg font-body">{dragHint.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto">
        {/* 图片预览区域 */}
        <AnimatePresence>
          {imagePreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-3"
            >
              <div className="relative inline-block">
                <img
                  src={imagePreview.previewUrl}
                  alt="预览"
                  className="max-h-32 rounded-sm border-2 border-paper-aged shadow-sm"
                />
                <motion.button
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 p-1 bg-ink-black text-paper-white rounded-full shadow-md hover:bg-vermilion transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={14} />
                </motion.button>
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-ink-black/50 rounded-sm flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-paper-white animate-spin" />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Word 文档预览区域 */}
        <AnimatePresence>
          {docPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-3"
            >
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-paper-cream border-2 border-paper-aged rounded-sm">
                {/* Word 图标 */}
                <FileText size={18} className="text-cyan-ink shrink-0" />
                
                {/* 文件名链接 - 点击下载本地文件 */}
                <button
                  onClick={openDoc}
                  className="text-sm text-cyan-ink hover:text-ink-black hover:underline flex items-center gap-1 transition-colors"
                  title="点击下载文档"
                >
                  <span className="max-w-[200px] truncate">{docPreview.file.name}</span>
                  <ExternalLink size={12} />
                </button>

                {/* 处理状态 */}
                {isProcessingDoc && (
                  <span className="text-xs text-ink-faint ml-2">
                    {docProgress === 'uploading' ? '上传中...' : '解析中...'}
                  </span>
                )}

                {/* 删除按钮 */}
                <motion.button
                  onClick={removeDoc}
                  disabled={isProcessingDoc}
                  className="p-1 text-ink-faint hover:text-vermilion transition-colors disabled:opacity-50"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={14} />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-2 text-sm text-vermilion"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-end gap-3">
          {/* 隐藏的图片文件输入 */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* 隐藏的文档文件输入 */}
          <input
            ref={docInputRef}
            type="file"
            accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleDocSelect}
            className="hidden"
          />

          {/* 图片上传按钮 */}
          <motion.button
            onClick={triggerImageInput}
            disabled={disabled || isProcessing}
            className={`
              p-3 rounded-sm
              ${!disabled && !isProcessing
                ? 'bg-paper-cream text-ink-medium hover:bg-paper-aged hover:text-ink-black border-2 border-paper-aged'
                : 'bg-paper-aged text-ink-faint cursor-not-allowed border-2 border-paper-aged'
              }
              transition-colors duration-300
            `}
            whileHover={!disabled && !isProcessing ? { scale: 1.05 } : {}}
            whileTap={!disabled && !isProcessing ? { scale: 0.95 } : {}}
            title="上传图片"
          >
            <ImagePlus size={20} />
          </motion.button>

          {/* Word 文档上传按钮 */}
          <motion.button
            onClick={triggerDocInput}
            disabled={disabled || isProcessing}
            className={`
              p-3 rounded-sm
              ${!disabled && !isProcessing
                ? 'bg-paper-cream text-ink-medium hover:bg-paper-aged hover:text-ink-black border-2 border-paper-aged'
                : 'bg-paper-aged text-ink-faint cursor-not-allowed border-2 border-paper-aged'
              }
              transition-colors duration-300
            `}
            whileHover={!disabled && !isProcessing ? { scale: 1.05 } : {}}
            whileTap={!disabled && !isProcessing ? { scale: 0.95 } : {}}
            title="上传 Word 文档"
          >
            <FileText size={20} />
          </motion.button>

          {/* 输入框 */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入消息，按 Enter 发送，Shift + Enter 换行，支持拖拽上传..."
              disabled={disabled || isProcessing}
              rows={1}
              className={`
                w-full px-4 py-3 pr-12
                bg-paper-white border-2 border-paper-aged
                rounded-sm resize-none
                text-ink-black placeholder-ink-faint
                focus:outline-none focus:border-ink-medium
                transition-colors duration-300
                disabled:opacity-50 disabled:cursor-not-allowed
                font-body
              `}
              style={{ minHeight: '52px', maxHeight: '200px' }}
            />
            
            {/* 字数统计 */}
            <span className="absolute right-3 bottom-3 text-xs text-ink-faint">
              {content.length}
            </span>
          </div>

          {/* 发送按钮 */}
          <motion.button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`
              p-3 rounded-sm
              ${canSend
                ? 'bg-ink-black text-paper-white hover:bg-ink-dark'
                : 'bg-paper-aged text-ink-faint cursor-not-allowed'
              }
              transition-colors duration-300
            `}
            whileHover={canSend ? { scale: 1.05 } : {}}
            whileTap={canSend ? { scale: 0.95 } : {}}
          >
            {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </motion.button>

          {/* 模型选择器 */}
          {models.length > 0 && (
            <div className="relative" ref={modelPickerRef}>
              <motion.button
                onClick={() => setShowModelPicker(!showModelPicker)}
                disabled={disabled || isProcessing}
                className={`
                  px-3 py-2 rounded-sm flex items-center gap-1.5
                  ${!disabled && !isProcessing
                    ? 'bg-paper-cream text-ink-medium hover:bg-paper-aged border-2 border-paper-aged'
                    : 'bg-paper-aged text-ink-faint cursor-not-allowed border-2 border-paper-aged'
                  }
                  transition-colors duration-300 text-sm
                `}
                whileHover={!disabled && !isProcessing ? { scale: 1.02 } : {}}
                whileTap={!disabled && !isProcessing ? { scale: 0.98 } : {}}
                title="选择模型"
              >
                <Cpu size={14} />
                <span className="max-w-[100px] truncate">
                  {displayModelObj ? getModelDisplayName(displayModelObj) : '选择模型'}
                </span>
                <ChevronUp 
                  size={14} 
                  className={`transition-transform ${showModelPicker ? 'rotate-180' : ''}`}
                />
              </motion.button>

              {/* 上拉选项 */}
              <AnimatePresence>
                {showModelPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 right-0 w-64 max-h-60 overflow-y-auto
                      bg-paper-white border-2 border-paper-aged rounded-sm shadow-lg z-50"
                  >
                    {models.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          onModelChange?.(model.id)
                          setShowModelPicker(false)
                        }}
                        className={`
                          w-full px-3 py-2 text-left text-sm
                          hover:bg-paper-cream transition-colors
                          ${model.id === displayModelId ? 'bg-paper-cream text-ink-black font-medium' : 'text-ink-medium'}
                          border-b border-paper-aged/50 last:border-b-0
                        `}
                      >
                        <div className="truncate" title={model.id}>{getModelDisplayName(model)}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* 提示文字 */}
        <p className="text-xs text-ink-faint mt-2 text-center">
          墨语AI可能会产生错误信息，请核实重要内容 · 支持拖拽上传图片或Word文档
        </p>
      </div>
    </motion.div>
  )
}
