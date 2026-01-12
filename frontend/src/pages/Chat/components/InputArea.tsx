import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ImagePlus, X, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
// 从独立的 uppic 模块导入
import { useImageUpload, type ImagePreview, type UploadResult } from '../../../../../modules/uppic/frontend'

interface InputAreaProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export default function InputArea({ onSend, disabled = false }: InputAreaProps) {
  const [content, setContent] = useState('')
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { user } = useAuthStore()
  
  // 使用 uppic 模块的 hook
  const { uploadImage, validateImage, isUploading, error, clearError } = useImageUpload({
    apiBase: '/uppic',
    folder: 'chat-images',
    userId: user?.id?.toString() || 'anonymous',
  })

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
    }
  }, [imagePreview])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImage(file)
    if (!validation.valid) {
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setImagePreview({ file, previewUrl })
    clearError()

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeImage = () => {
    if (imagePreview?.previewUrl) {
      URL.revokeObjectURL(imagePreview.previewUrl)
    }
    setImagePreview(null)
    clearError()
  }

  const handleSubmit = async () => {
    if ((!content.trim() && !imagePreview) || disabled || isUploading) return

    let imageUrl: string | undefined

    // 如果有图片，通过 uppic 服务上传
    if (imagePreview) {
      const result = await uploadImage(imagePreview.file)
      if (result) {
        imageUrl = result.url
      } else {
        return // 上传失败，不发送消息
      }
    }

    // 构建消息内容
    let messageContent = content.trim()
    if (imageUrl) {
      const imageMarkdown = `![图片](${imageUrl})`
      messageContent = messageContent 
        ? `${messageContent}\n\n${imageMarkdown}` 
        : imageMarkdown
    }

    onSend(messageContent)
    setContent('')
    removeImage()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const canSend = (content.trim() || imagePreview) && !disabled && !isUploading

  return (
    <motion.div
      className="border-t border-paper-aged bg-paper-white/80 backdrop-blur-sm p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="max-w-4xl mx-auto">
        {/* 图片预览区域 */}
        <AnimatePresence>
          {imagePreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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
                {isUploading && (
                  <div className="absolute inset-0 bg-ink-black/50 rounded-sm flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-paper-white animate-spin" />
                  </div>
                )}
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
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* 图片上传按钮 - 使用水墨风格 */}
          <motion.button
            onClick={triggerFileInput}
            disabled={disabled || isUploading}
            className={`
              p-3 rounded-sm
              ${!disabled && !isUploading
                ? 'bg-paper-cream text-ink-medium hover:bg-paper-aged hover:text-ink-black border-2 border-paper-aged'
                : 'bg-paper-aged text-ink-faint cursor-not-allowed border-2 border-paper-aged'
              }
              transition-colors duration-300
            `}
            whileHover={!disabled && !isUploading ? { scale: 1.05 } : {}}
            whileTap={!disabled && !isUploading ? { scale: 0.95 } : {}}
            title="上传图片"
          >
            <ImagePlus size={20} />
          </motion.button>

          {/* 输入框 */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入消息，按 Enter 发送，Shift + Enter 换行..."
              disabled={disabled || isUploading}
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
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </motion.button>
        </div>

        {/* 提示文字 */}
        <p className="text-xs text-ink-faint mt-2 text-center">
          墨语AI可能会产生错误信息，请核实重要内容 · 支持上传图片
        </p>
      </div>
    </motion.div>
  )
}
