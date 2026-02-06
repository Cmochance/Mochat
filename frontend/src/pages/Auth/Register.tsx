import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, Mail, ArrowLeft, Send, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { authService } from '../../services/authService'

export default function Register() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    code: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [codeSent, setCodeSent] = useState(false)

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // 验证密码格式
  const validatePassword = (password: string): { valid: boolean; message: string } => {
    if (!/^[a-zA-Z0-9]+$/.test(password)) {
      return { valid: false, message: t('register.errors.passwordNoSpecialChars') }
    }
    
    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /[0-9]/.test(password)
    const typeCount = [hasLower, hasUpper, hasDigit].filter(Boolean).length
    
    if (typeCount < 2) {
      return { valid: false, message: t('register.errors.passwordRequireTwoTypes') }
    }
    
    return { valid: true, message: '' }
  }

  // 验证邮箱格式
  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  // 发送验证码
  const handleSendCode = useCallback(async () => {
    if (!formData.email) {
      setError(t('register.errors.enterEmail'))
      return
    }
    
    if (!isValidEmail(formData.email)) {
      setError(t('register.errors.invalidEmail'))
      return
    }

    setSendingCode(true)
    setError('')

    try {
      const response = await authService.sendVerificationCode(formData.email, 'register')
      setCodeSent(true)
      setCountdown(response.cooldown || 60)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.errors.sendCodeFailed'))
    } finally {
      setSendingCode(false)
    }
  }, [formData.email, t])

  // 提交注册
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 验证必填项
    if (!formData.code) {
      setError(t('register.errors.enterCode'))
      return
    }

    if (formData.code.length !== 6 || !/^\d{6}$/.test(formData.code)) {
      setError(t('register.errors.invalidCode'))
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('register.errors.passwordMismatch'))
      return
    }

    if (formData.password.length < 6) {
      setError(t('register.errors.passwordTooShort'))
      return
    }

    const passwordValidation = validatePassword(formData.password)
    if (!passwordValidation.valid) {
      setError(passwordValidation.message)
      return
    }

    setLoading(true)

    try {
      await authService.register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        code: formData.code,
      })
      navigate('/auth/login', { 
        state: { message: t('register.registerSuccess') } 
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.errors.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper-gradient flex">
      {/* 左侧表单区 */}
      <motion.div
        className="w-full lg:w-1/2 flex items-center justify-center p-8"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="w-full max-w-md">
          {/* 返回按钮 */}
          <motion.button
            className="flex items-center gap-2 text-ink-light hover:text-ink-black mb-8 transition-colors"
            onClick={() => navigate('/')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <ArrowLeft size={20} />
            {t('common.backToHome')}
          </motion.button>

          {/* 标题 */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-4xl font-title text-ink-black mb-2">{t('register.title')}</h2>
            <p className="text-ink-light">{t('register.subtitle')}</p>
          </motion.div>

          {/* 错误提示 */}
          {error && (
            <motion.div
              className="mb-6 p-4 bg-vermilion/10 border border-vermilion/30 text-vermilion rounded-sm"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}

          {/* 表单 */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Input
              label={t('register.username')}
              placeholder={t('register.usernamePlaceholder')}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              icon={<User size={18} />}
              required
              minLength={2}
              maxLength={50}
            />

            {/* 邮箱 + 发送验证码 */}
            <div>
              <label className="block text-sm font-medium text-ink-dark mb-2">{t('register.email')}</label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light">
                      <Mail size={18} />
                    </span>
                    <input
                      type="email"
                      placeholder={t('register.emailPlaceholder')}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-paper-cream border border-ink-light/20 rounded-sm
                        focus:outline-none focus:border-ink-dark focus:ring-1 focus:ring-ink-dark/20
                        placeholder:text-ink-light/50 text-ink-dark transition-all"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0 || !formData.email}
                  className={`
                    px-4 py-3 rounded-sm font-medium text-sm whitespace-nowrap transition-all
                    flex items-center gap-2
                    ${countdown > 0 || sendingCode || !formData.email
                      ? 'bg-ink-light/20 text-ink-light cursor-not-allowed'
                      : 'bg-ink-dark text-paper-white hover:bg-ink-black'
                    }
                  `}
                >
                  <Send size={16} />
                  {sendingCode ? t('register.sending') : countdown > 0 ? `${countdown}s` : t('register.sendCode')}
                </button>
              </div>
              {codeSent && countdown > 0 && (
                <p className="text-xs text-cyan-ink mt-2">
                  {t('register.codeSent')}
                </p>
              )}
            </div>

            {/* 验证码输入 */}
            <div>
              <label className="block text-sm font-medium text-ink-dark mb-2">{t('register.verificationCode')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light">
                  <Shield size={18} />
                </span>
                <input
                  type="text"
                  placeholder={t('register.codePlaceholder')}
                  value={formData.code}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setFormData({ ...formData, code: value })
                  }}
                  required
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-paper-cream border border-ink-light/20 rounded-sm
                    focus:outline-none focus:border-ink-dark focus:ring-1 focus:ring-ink-dark/20
                    placeholder:text-ink-light/50 text-ink-dark transition-all tracking-[0.5em] font-mono text-lg"
                />
              </div>
            </div>

            <div>
              <Input
                label={t('register.password')}
                type="password"
                placeholder={t('register.passwordPlaceholder')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                icon={<Lock size={18} />}
                required
                minLength={6}
              />
              <p className="text-xs text-ink-light mt-1">
                {t('register.passwordHint')}
              </p>
            </div>

            <Input
              label={t('register.confirmPassword')}
              type="password"
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              icon={<Lock size={18} />}
              required
            />

            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
              variant="seal"
            >
              {t('common.register')}
            </Button>
          </motion.form>

          {/* 登录链接 */}
          <motion.p
            className="mt-8 text-center text-ink-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {t('register.hasAccount')}
            <Link
              to="/auth/login"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              {t('register.loginNow')}
            </Link>
          </motion.p>
        </div>
      </motion.div>

      {/* 右侧装饰区 */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 bg-ink-black items-center justify-center relative overflow-hidden"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* 水墨背景效果 */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-white/5 blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.4, 0.6, 0.4],
            }}
            transition={{ duration: 7, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-1/3 left-1/4 w-56 h-56 rounded-full bg-cyan-ink/10 blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.6, 0.4, 0.6],
            }}
            transition={{ duration: 7, repeat: Infinity }}
          />
        </div>

        <div className="relative z-10 text-center text-paper-white p-12">
          <motion.div
            className="text-9xl font-title mb-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            {t('register.decorativeChar')}
          </motion.div>
          <motion.p
            className="text-xl text-paper-cream/80 max-w-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {t('register.decorativeText1')}<br />{t('register.decorativeText2')}
          </motion.p>
        </div>
      </motion.div>

      {/* 语言切换按钮 */}
      <LanguageSwitcher />
    </div>
  )
}
