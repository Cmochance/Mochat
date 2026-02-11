import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, FileText, ImagePlus, Palette, Presentation, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ComposerToolbarProps {
  disabled?: boolean
  isProcessing?: boolean
  isDrawMode?: boolean
  isPPTMode?: boolean
  onImageUpload: () => void
  onDocUpload: () => void
  onToggleDraw: () => void
  onTogglePPT: () => void
  className?: string
}

export default function ComposerToolbar({
  disabled = false,
  isProcessing = false,
  isDrawMode = false,
  isPPTMode = false,
  onImageUpload,
  onDocUpload,
  onToggleDraw,
  onTogglePPT,
  className = '',
}: ComposerToolbarProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const triggerBtn = `
    flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-ui
    transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50
    ${open
      ? 'border-line-strong bg-paper-aged text-ink-black'
      : 'border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged'}
  `

  const toolBtn = `
    rounded-md border-2 p-2.5 transition-colors duration-200
    disabled:cursor-not-allowed disabled:opacity-50
  `

  const handleImageUpload = () => {
    onImageUpload()
    setOpen(false)
  }

  const handleDocUpload = () => {
    onDocUpload()
    setOpen(false)
  }

  const handleToggleDraw = () => {
    onToggleDraw()
    setOpen(false)
  }

  const handleTogglePPT = () => {
    onTogglePPT()
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <motion.button
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={triggerBtn}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
        title={t('input.basicActions')}
      >
        <SlidersHorizontal size={16} />
        <span className="hidden sm:inline">{t('input.basicActions')}</span>
        <ChevronUp size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="absolute bottom-full right-0 z-30 mb-2 flex items-center gap-2 rounded-md border border-paper-aged bg-paper-white p-2 shadow-lg"
          >
            <motion.button
              onClick={handleImageUpload}
              disabled={disabled || isProcessing || isDrawMode || isPPTMode}
              className={`${toolBtn} border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged`}
              whileHover={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 1.04 } : {}}
              whileTap={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 0.96 } : {}}
              title={t('input.uploadImage')}
            >
              <ImagePlus size={18} />
            </motion.button>

            <motion.button
              onClick={handleDocUpload}
              disabled={disabled || isProcessing || isDrawMode || isPPTMode}
              className={`${toolBtn} border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged`}
              whileHover={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 1.04 } : {}}
              whileTap={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 0.96 } : {}}
              title={t('input.uploadDoc')}
            >
              <FileText size={18} />
            </motion.button>

            <motion.button
              onClick={handleToggleDraw}
              disabled={disabled || isProcessing || isPPTMode}
              className={`${toolBtn} ${isDrawMode
                ? 'border-cyan-ink bg-cyan-ink text-paper-white'
                : 'border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged'
              }`}
              whileHover={!disabled && !isProcessing && !isPPTMode ? { scale: 1.04 } : {}}
              whileTap={!disabled && !isProcessing && !isPPTMode ? { scale: 0.96 } : {}}
              title={isDrawMode ? t('input.exitDrawMode') : t('input.drawMode')}
            >
              <Palette size={18} />
            </motion.button>

            <motion.button
              onClick={handleTogglePPT}
              disabled={disabled || isProcessing || isDrawMode}
              className={`${toolBtn} ${isPPTMode
                ? 'border-vermilion bg-vermilion text-paper-white'
                : 'border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged'
              }`}
              whileHover={!disabled && !isProcessing && !isDrawMode ? { scale: 1.04 } : {}}
              whileTap={!disabled && !isProcessing && !isDrawMode ? { scale: 0.96 } : {}}
              title={isPPTMode ? t('input.exitPptMode') : t('input.pptMode')}
            >
              <Presentation size={18} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
