import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import zh from './locales/zh'
import en from './locales/en'

// 判断是否为中文语言
const isChineseLanguage = (lang: string): boolean => {
  const chineseLocales = ['zh', 'zh-CN', 'zh-TW', 'zh-HK', 'zh-SG']
  return chineseLocales.some(locale => lang.startsWith(locale))
}

// 获取初始语言
const getInitialLanguage = (): string => {
  // 首先检查 localStorage
  const savedLang = localStorage.getItem('mochat_language')
  if (savedLang) {
    return savedLang
  }
  
  // 然后检测浏览器语言
  const browserLang = navigator.language || (navigator as any).userLanguage
  return isChineseLanguage(browserLang) ? 'zh' : 'en'
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React 已经安全处理了
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mochat_language',
      caches: ['localStorage'],
    },
  })

// 保存语言选择
export const setLanguage = (lang: string) => {
  localStorage.setItem('mochat_language', lang)
  i18n.changeLanguage(lang)
}

// 获取当前语言
export const getCurrentLanguage = () => i18n.language

// 判断是否为中文
export const isZh = () => i18n.language === 'zh'

export default i18n
