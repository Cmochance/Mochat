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
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
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
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 right-0 bg-paper-white border-2 border-paper-aged rounded-sm shadow-lg overflow-hidden min-w-[120px]"
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`
                  w-full px-4 py-2.5 text-left text-sm flex items-center gap-2
                  hover:bg-paper-cream transition-colors
                  ${lang.code === currentLang ? 'bg-paper-cream text-ink-black font-medium' : 'text-ink-medium'}
                  border-b border-paper-aged/50 last:border-b-0
                `}
              >
                <span>{lang.flag}</span>
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
          flex items-center gap-2 px-4 py-2.5 rounded-sm
          bg-paper-white border-2 border-paper-aged
          text-ink-medium hover:text-ink-black hover:bg-paper-cream
          shadow-md hover:shadow-lg
          transition-all duration-200
        `}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title={t('language.switch')}
      >
        <Globe size={18} />
        <span className="text-sm font-medium">{currentLanguage.flag} {currentLanguage.label}</span>
      </motion.button>
    </div>
  )
}
