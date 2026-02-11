import { useEffect, useRef, useState, type DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Loader2, Send, Palette, Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../../stores/authStore'
import { userService } from '../../../services/userService'
import { useImageUpload, type ImagePreview } from '@uppic'
import { useDocUpload } from '@upword'
import type { ChatMode } from '../../../types'
import ComposerAttachment from './composer/ComposerAttachment'
import ComposerTextArea from './composer/ComposerTextArea'
import ComposerToolbar from './composer/ComposerToolbar'
import ModelPicker, { type PickerModel } from './composer/ModelPicker'

export interface ModelInfo extends PickerModel {}

interface InputAreaProps {
  onSend: (content: string, model?: string) => void
  onGenerateImage?: (prompt: string) => void
  onGeneratePPT?: (prompt: string) => void
  isAuthenticated?: boolean
  onAuthRequired?: () => void
  disabled?: boolean
  models?: ModelInfo[]
  currentModel?: string
  defaultModel?: string
  onModelChange?: (model: string) => void
  isDrawMode?: boolean
  onDrawModeChange?: (mode: boolean) => void
  isPPTMode?: boolean
  onPPTModeChange?: (mode: boolean) => void
}

interface DocPreview {
  file: File
  localUrl: string
}

export default function InputArea({
  onSend,
  onGenerateImage,
  onGeneratePPT,
  isAuthenticated = true,
  onAuthRequired,
  disabled = false,
  models = [],
  currentModel,
  defaultModel,
  onModelChange,
  isDrawMode = false,
  onDrawModeChange,
  isPPTMode = false,
  onPPTModeChange,
}: InputAreaProps) {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const [content, setContent] = useState('')
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const [docPreview, setDocPreview] = useState<DocPreview | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragFileType, setDragFileType] = useState<'image' | 'doc' | 'unknown'>('unknown')
  const [fileError, setFileError] = useState<string | null>(null)
  const dragCounterRef = useRef(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const { uploadImage, validateImage, isUploading: isUploadingImage, error: imageError, clearError: clearImageError } = useImageUpload({
    apiBase: '/uppic',
    folder: 'chat-images',
    userId: user?.id?.toString() || 'anonymous',
  })

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
  const displayModelId = currentModel || defaultModel || models[0]?.id
  const mode: ChatMode = isDrawMode ? 'draw' : isPPTMode ? 'ppt' : 'chat'

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
  }, [content])

  useEffect(() => {
    return () => {
      if (imagePreview?.previewUrl) URL.revokeObjectURL(imagePreview.previewUrl)
      if (docPreview?.localUrl) URL.revokeObjectURL(docPreview.localUrl)
    }
  }, [imagePreview, docPreview])

  const clearFileError = () => setFileError(null)

  const isWordDocument = (file: File) => {
    const wordMimeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    const fileName = file.name.toLowerCase()
    return wordMimeTypes.includes(file.type) || fileName.endsWith('.doc') || fileName.endsWith('.docx')
  }

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const validation = validateImage(file)
    if (!validation.valid) return
    const previewUrl = URL.createObjectURL(file)
    setImagePreview({ file, previewUrl })
    clearImageError()
    clearFileError()
  }

  const processDocFile = (file: File) => {
    if (!isWordDocument(file)) return
    const validation = validateDoc(file)
    if (!validation.valid) return
    const localUrl = URL.createObjectURL(file)
    setDocPreview({ file, localUrl })
    clearDocError()
    clearFileError()
  }

  const processFile = (file: File) => {
    clearFileError()
    if (file.type.startsWith('image/')) {
      processImageFile(file)
      return
    }
    if (isWordDocument(file)) {
      processDocFile(file)
      return
    }
    setFileError(t('input.unknownFormat'))
    setTimeout(() => setFileError(null), 3000)
  }

  const detectDragFileType = (e: DragEvent<HTMLDivElement>): 'image' | 'doc' | 'unknown' => {
    const items = e.dataTransfer.items
    if (!items || items.length === 0) return 'unknown'
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (item.type.startsWith('image/')) return 'image'
      if (
        item.type === 'application/msword' ||
        item.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        return 'doc'
      }
    }
    return 'unknown'
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (!disabled && !isProcessing && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
      setDragFileType(detectDragFileType(e))
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
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
    if (!files.length) return
    processFile(files[0])
  }

  const removeImage = () => {
    if (imagePreview?.previewUrl) URL.revokeObjectURL(imagePreview.previewUrl)
    setImagePreview(null)
    clearImageError()
  }

  const removeDoc = () => {
    if (docPreview?.localUrl) URL.revokeObjectURL(docPreview.localUrl)
    setDocPreview(null)
    clearDocError()
  }

  const openDoc = () => {
    if (!docPreview) return
    const link = document.createElement('a')
    link.href = docPreview.localUrl
    link.download = docPreview.file.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const buildMessageContent = async () => {
    let messageContent = content.trim()
    let imageUrl: string | undefined
    let docInfo: { key: string; filename: string } | undefined

    if (imagePreview) {
      const result = await uploadImage(imagePreview.file)
      if (!result) return null
      imageUrl = result.url
    }

    if (docPreview) {
      const result = await uploadAndParse(docPreview.file)
      if (!result) return null
      docInfo = { key: result.key, filename: docPreview.file.name }
    }

    if (imageUrl) {
      const imageMarkdown = `![图片](${imageUrl})`
      messageContent = messageContent ? `${messageContent}\n\n${imageMarkdown}` : imageMarkdown
    }

    if (docInfo) {
      const docTag = `<!-- DOC:${docInfo.filename}:${docInfo.key} --><!-- /DOC -->`
      messageContent = messageContent ? `${messageContent}\n\n${docTag}` : docTag
    }

    return messageContent
  }

  const resetComposer = () => {
    setContent('')
    removeImage()
    removeDoc()
  }

  const handleSubmit = async () => {
    if ((!content.trim() && !imagePreview && !docPreview) || disabled || isProcessing) return
    if (!isAuthenticated) {
      onAuthRequired?.()
      return
    }

    if (isDrawMode && content.trim()) {
      try {
        const { allowed, message } = await userService.checkImageLimit()
        if (!allowed) {
          setFileError(message || t('chat.usage.imageExhausted'))
          setTimeout(() => setFileError(null), 5000)
          return
        }
      } catch (err) {
        console.error('检查生图限额失败:', err)
      }
      onGenerateImage?.(content.trim())
      setContent('')
      return
    }

    if (isPPTMode && content.trim()) {
      onGeneratePPT?.(content.trim())
      setContent('')
      return
    }

    const message = await buildMessageContent()
    if (message === null) return
    onSend(message || '', displayModelId)
    resetComposer()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const triggerImageInput = () => imageInputRef.current?.click()
  const triggerDocInput = () => docInputRef.current?.click()

  const canSend = Boolean(content.trim() || imagePreview || docPreview) && !disabled && !isProcessing
  const dragHintText = dragFileType === 'image' ? t('input.dropImage') : dragFileType === 'doc' ? t('input.dropDoc') : t('input.unknownFormat')

  return (
    <motion.div
      className={`
        relative border-t border-line-soft bg-paper-white/80 p-3 backdrop-blur-sm md:p-4
        ${isDragging ? 'ring-2 ring-ink-medium ring-inset bg-paper-cream/60' : ''}
      `}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-ink-medium bg-paper-cream/90"
          >
            <div className="flex items-center gap-2 text-ink-medium">
              <AlertCircle size={20} />
              <span className="font-ui text-sm">{dragHintText}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-4xl">
        <ComposerAttachment
          imagePreview={imagePreview}
          docPreview={docPreview}
          isUploadingImage={isUploadingImage}
          isProcessingDoc={isProcessingDoc}
          docProgress={docProgress}
          onRemoveImage={removeImage}
          onRemoveDoc={removeDoc}
          onOpenDoc={openDoc}
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-2 flex items-center gap-1 text-sm font-ui text-vermilion"
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) processImageFile(file)
            if (imageInputRef.current) imageInputRef.current.value = ''
          }}
          className="hidden"
        />

        <input
          ref={docInputRef}
          type="file"
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) processDocFile(file)
            if (docInputRef.current) docInputRef.current.value = ''
          }}
          className="hidden"
        />

        <div className="flex flex-col gap-2 md:gap-3">
          <div className="flex items-end gap-2 md:gap-3">
            <ComposerTextArea
              value={content}
              onChange={setContent}
              onKeyDown={handleKeyDown}
              textareaRef={textareaRef}
              disabled={disabled || isProcessing}
              mode={mode}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <ModelPicker
              models={models}
              currentModel={currentModel}
              defaultModel={defaultModel}
              disabled={disabled || isProcessing}
              onModelChange={onModelChange}
            />

            <ComposerToolbar
              disabled={disabled}
              isProcessing={isProcessing}
              isDrawMode={isDrawMode}
              isPPTMode={isPPTMode}
              onImageUpload={triggerImageInput}
              onDocUpload={triggerDocInput}
              onToggleDraw={() => {
                onDrawModeChange?.(!isDrawMode)
                if (!isDrawMode) onPPTModeChange?.(false)
              }}
              onTogglePPT={() => {
                onPPTModeChange?.(!isPPTMode)
                if (!isPPTMode) onDrawModeChange?.(false)
              }}
              className="ml-0"
            />

            <motion.button
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              className={`
                rounded-md p-2.5 transition-colors duration-200
                ${canSend
                  ? isDrawMode
                    ? 'bg-cyan-ink text-paper-white hover:bg-cyan-ink/85'
                    : isPPTMode
                      ? 'bg-vermilion text-paper-white hover:bg-vermilion/85'
                      : 'bg-ink-black text-paper-white hover:bg-ink-dark'
                  : 'cursor-not-allowed bg-paper-aged text-ink-faint'
                }
              `}
              whileHover={canSend ? { scale: 1.04 } : {}}
              whileTap={canSend ? { scale: 0.96 } : {}}
              title={isDrawMode ? t('input.generateImage') : isPPTMode ? t('input.generatePpt') : t('input.sendMessage')}
            >
              {isProcessing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : isDrawMode ? (
                <Palette size={20} />
              ) : isPPTMode ? (
                <Presentation size={20} />
              ) : (
                <Send size={20} />
              )}
            </motion.button>
          </div>
        </div>

        <p className="mt-2 text-center text-xs font-ui text-ink-faint">
          {isDrawMode
            ? t('input.drawModeHint')
            : isPPTMode
              ? t('input.pptModeHint')
              : t('input.disclaimer')}
        </p>
      </div>
    </motion.div>
  )
}
