import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'

interface LanguageSwitcherProps {
  className?: string
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentLang = i18n.language

  const languages = [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'English' },
  ]

  const currentLanguage = languages.find(l => l.code === currentLang) || languages[0]

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode)
    setIsOpen(false)
  }

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div
      ref={menuRef}
      className={`fixed bottom-6 right-6 z-50 ${className}`}
    >
      {/* 语言选择菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-1 right-0 bg-paper-white border border-paper-aged rounded-md shadow-md overflow-hidden min-w-[120px]"
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`
                  w-full px-4 py-2 text-left text-sm
                  hover:bg-paper-cream transition-colors
                  ${lang.code === currentLang ? 'text-cyan-ink font-medium bg-paper-cream/60' : 'text-ink-medium'}
                  border-b border-paper-aged/50 last:border-b-0
                `}
              >
                <span>{lang.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 切换按钮 */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-md
          text-sm text-ink-medium/80 hover:text-ink-black hover:bg-paper-cream
          transition-colors duration-200
        `}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        title={t('language.switch')}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{currentLanguage.label}</span>
      </motion.button>
    </div>
  )
}
