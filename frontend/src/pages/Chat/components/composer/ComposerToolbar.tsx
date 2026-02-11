import { motion } from 'framer-motion'
import { FileText, ImagePlus, Palette, Presentation } from 'lucide-react'
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

const sharedBtn = `
  rounded-md border-2 p-2.5 transition-colors duration-200
  disabled:cursor-not-allowed disabled:opacity-50
`

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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.button
        onClick={onImageUpload}
        disabled={disabled || isProcessing || isDrawMode || isPPTMode}
        className={`${sharedBtn} border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged`}
        whileHover={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 1.04 } : {}}
        whileTap={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 0.96 } : {}}
        title={t('input.uploadImage')}
      >
        <ImagePlus size={18} />
      </motion.button>

      <motion.button
        onClick={onDocUpload}
        disabled={disabled || isProcessing || isDrawMode || isPPTMode}
        className={`${sharedBtn} border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged`}
        whileHover={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 1.04 } : {}}
        whileTap={!disabled && !isProcessing && !isDrawMode && !isPPTMode ? { scale: 0.96 } : {}}
        title={t('input.uploadDoc')}
      >
        <FileText size={18} />
      </motion.button>

      <motion.button
        onClick={onToggleDraw}
        disabled={disabled || isProcessing || isPPTMode}
        className={`${sharedBtn} ${isDrawMode
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
        onClick={onTogglePPT}
        disabled={disabled || isProcessing || isDrawMode}
        className={`${sharedBtn} ${isPPTMode
          ? 'border-vermilion bg-vermilion text-paper-white'
          : 'border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged'
        }`}
        whileHover={!disabled && !isProcessing && !isDrawMode ? { scale: 1.04 } : {}}
        whileTap={!disabled && !isProcessing && !isDrawMode ? { scale: 0.96 } : {}}
        title={isPPTMode ? t('input.exitPptMode') : t('input.pptMode')}
      >
        <Presentation size={18} />
      </motion.button>
    </div>
  )
}
