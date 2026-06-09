import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ImagePreview } from '@uppic'

interface DocPreview {
  file: File
  localUrl: string
}

interface ComposerAttachmentProps {
  imagePreview: ImagePreview | null
  docPreview: DocPreview | null
  isUploadingImage: boolean
  imageUploadProgress?: number
  isProcessingDoc: boolean
  docProgress?: string
  docUploadPercent?: number
  onRemoveImage: () => void
  onRemoveDoc: () => void
  onOpenDoc: () => void
}

export default function ComposerAttachment({
  imagePreview,
  docPreview,
  isUploadingImage,
  imageUploadProgress = 0,
  isProcessingDoc,
  docProgress,
  docUploadPercent = 0,
  onRemoveImage,
  onRemoveDoc,
  onOpenDoc,
}: ComposerAttachmentProps) {
  const { t } = useTranslation()

  return (
    <>
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
                alt={t('input.preview')}
                className="max-h-32 rounded-md border-2 border-paper-aged shadow-sm"
              />
              <motion.button
                onClick={onRemoveImage}
                className="absolute -top-2 -right-2 rounded-full bg-ink-black p-1 text-paper-white shadow-md transition-colors hover:bg-vermilion"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <X size={14} />
              </motion.button>
              {isUploadingImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-ink-black/50 gap-1">
                  <div className="w-4/5 h-1.5 rounded-full bg-paper-white/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-paper-white transition-all duration-300"
                      style={{ width: `${imageUploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-paper-white font-ui">{imageUploadProgress}%</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {docPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mb-3"
          >
            <div className="inline-flex items-center gap-2 rounded-md border-2 border-paper-aged bg-paper-cream px-3 py-2">
              <FileText size={18} className="shrink-0 text-cyan-ink" />
              <button
                onClick={onOpenDoc}
                className="flex items-center gap-1 text-sm text-cyan-ink transition-colors hover:text-ink-black hover:underline"
                title={t('input.clickToDownload')}
              >
                <span className="max-w-[220px] truncate">{docPreview.file.name}</span>
                <ExternalLink size={12} />
              </button>
              {isProcessingDoc && (
                docProgress === 'uploading' ? (
                  <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <span>{t('input.uploading')}</span>
                    <span className="inline-block w-16 h-1.5 rounded-full bg-ink-faint/20 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-cyan-ink transition-all duration-300"
                        style={{ width: `${docUploadPercent}%` }}
                      />
                    </span>
                    <span>{docUploadPercent}%</span>
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">{t('input.parsing')}</span>
                )
              )}
              <motion.button
                onClick={onRemoveDoc}
                disabled={isProcessingDoc}
                className="rounded p-1 text-ink-faint transition-colors hover:text-vermilion disabled:opacity-40"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
              >
                <X size={14} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
