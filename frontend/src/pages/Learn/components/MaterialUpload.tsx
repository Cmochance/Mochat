import { useRef, useState } from 'react'
import { Upload, FileText, Type } from 'lucide-react'
import Button from '../../../components/common/Button'
import { useTranslation } from 'react-i18next'

interface MaterialUploadProps {
  onUpload: (file: File) => void
  onTextSubmit: (title: string, content: string) => void
  isUploading: boolean
}

const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx']

export default function MaterialUpload({ onUpload, onTextSubmit, isUploading }: MaterialUploadProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(t('learn.upload.unsupportedType', { ext }))
      return
    }
    onUpload(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleTextSubmit = () => {
    if (!textTitle.trim() || !textContent.trim()) return
    onTextSubmit(textTitle.trim(), textContent.trim())
    setTextTitle('')
    setTextContent('')
  }

  return (
    <div className="space-y-4">
      {/* 模式切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('file')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm transition-colors ${
            mode === 'file'
              ? 'bg-ink-black text-paper-white'
              : 'text-ink-medium hover:text-ink-black'
          }`}
        >
          <Upload size={14} />
          {t('learn.upload.fileMode')}
        </button>
        <button
          onClick={() => setMode('text')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm transition-colors ${
            mode === 'text'
              ? 'bg-ink-black text-paper-white'
              : 'text-ink-medium hover:text-ink-black'
          }`}
        >
          <Type size={14} />
          {t('learn.upload.textMode')}
        </button>
      </div>

      {mode === 'file' ? (
        <div
          className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-ink-black bg-ink-black/5'
              : 'border-paper-aged hover:border-ink-faint'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <FileText className="mx-auto mb-3 text-ink-faint" size={32} />
          <p className="text-ink-medium text-sm mb-1">
            {t('learn.upload.dragHint')}
          </p>
          <p className="text-ink-faint text-xs">
            {t('learn.upload.supportedTypes')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder={t('learn.upload.titlePlaceholder')}
            className="w-full px-3 py-2 border border-paper-aged rounded-sm text-sm
                       bg-paper-white text-ink-black placeholder:text-ink-faint
                       focus:outline-none focus:border-ink-black"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder={t('learn.upload.contentPlaceholder')}
            rows={8}
            className="w-full px-3 py-2 border border-paper-aged rounded-sm text-sm
                       bg-paper-white text-ink-black placeholder:text-ink-faint
                       focus:outline-none focus:border-ink-black resize-none"
          />
          <Button
            onClick={handleTextSubmit}
            disabled={!textTitle.trim() || !textContent.trim() || isUploading}
            className="w-full"
          >
            {isUploading ? t('learn.upload.processing') : t('learn.upload.submitText')}
          </Button>
        </div>
      )}
    </div>
  )
}
