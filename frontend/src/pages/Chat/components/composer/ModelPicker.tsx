import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface PickerModel {
  id: string
  name: string
  owned_by?: string | null
}

interface ModelPickerProps {
  models: PickerModel[]
  currentModel?: string
  defaultModel?: string
  disabled?: boolean
  onModelChange?: (model: string) => void
  className?: string
}

const getModelDisplayName = (model: PickerModel) => {
  if (model.name && model.name !== model.id) {
    return model.name
  }
  const parts = model.id.split('/')
  return parts[parts.length - 1]
}

export default function ModelPicker({
  models,
  currentModel,
  defaultModel,
  disabled = false,
  onModelChange,
  className = '',
}: ModelPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (!models.length) {
    return null
  }

  const modelId = currentModel || defaultModel || models[0]?.id
  const model = models.find((item) => item.id === modelId)

  return (
    <div className={`relative ${className}`}>
      <motion.button
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-ui
          ${!disabled
            ? 'border-paper-aged bg-paper-cream text-ink-medium hover:border-line-strong hover:bg-paper-aged'
            : 'cursor-not-allowed border-paper-aged bg-paper-aged text-ink-faint'
          }
        `}
      >
        <Cpu size={14} />
        <span className="max-w-[96px] truncate">
          {model ? getModelDisplayName(model) : t('input.selectModel')}
        </span>
        <ChevronUp size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute bottom-full right-0 z-30 mb-2 max-h-56 w-64 overflow-y-auto rounded-md border border-paper-aged bg-paper-white shadow-lg"
          >
            {models.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onModelChange?.(item.id)
                  setOpen(false)
                }}
                className={`
                  w-full border-b border-paper-aged/60 px-3 py-2 text-left text-sm font-ui transition-colors last:border-b-0
                  ${item.id === modelId ? 'bg-paper-cream text-ink-black' : 'text-ink-medium hover:bg-paper-cream'}
                `}
                title={item.id}
              >
                <span className="truncate">{getModelDisplayName(item)}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
