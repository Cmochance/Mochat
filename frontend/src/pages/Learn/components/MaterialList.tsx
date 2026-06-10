import { FileText, File, Trash2, BookOpen } from 'lucide-react'
import type { LearningMaterial } from '../../../types'
import { useTranslation } from 'react-i18next'

interface MaterialListProps {
  materials: LearningMaterial[]
  currentId: number | null
  onSelect: (material: LearningMaterial) => void
  onDelete: (id: number) => void
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  md: File,
  txt: File,
  text: File,
}

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'text-red-600',
  docx: 'text-blue-600',
  md: 'text-green-600',
  txt: 'text-ink-medium',
  text: 'text-ink-medium',
}

export default function MaterialList({ materials, currentId, onSelect, onDelete }: MaterialListProps) {
  const { t } = useTranslation()

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ink-faint">
        <BookOpen size={32} className="mb-2" />
        <p className="text-sm">{t('learn.materials.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {materials.map((m) => {
        const Icon = FILE_TYPE_ICONS[m.file_type] || File
        const color = FILE_TYPE_COLORS[m.file_type] || 'text-ink-medium'
        const isActive = m.id === currentId

        return (
          <div
            key={m.id}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-sm cursor-pointer transition-colors ${
              isActive
                ? 'bg-ink-black text-paper-white'
                : 'hover:bg-paper-aged text-ink-black'
            }`}
            onClick={() => onSelect(m)}
          >
            <Icon size={16} className={isActive ? 'text-paper-white' : color} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{m.title}</p>
              <p className={`text-xs ${isActive ? 'text-paper-white/60' : 'text-ink-faint'}`}>
                {m.file_type.toUpperCase()} · {new Date(m.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${
                isActive ? 'hover:bg-paper-white/20' : 'hover:bg-ink-black/10'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(m.id)
              }}
              title={t('common.delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
