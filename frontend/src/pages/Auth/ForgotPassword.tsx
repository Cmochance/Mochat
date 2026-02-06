import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowLeft, Send, Shield, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { authService } from '../../services/authService'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  
  const [formData, setFormData] = useState({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [codeSent, setCodeSent] = useState(false)
  const [success, setSuccess] = useState(false)

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
      const response = await authService.sendVerificationCode(formData.email, 'reset_password')
      setCodeSent(true)
      setCountdown(response.cooldown || 60)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.errors.sendCodeFailed'))
    } finally {
      setSendingCode(false)
    }
  }, [formData.email, t])

  // 提交重置
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

    if (formData.newPassword !== formData.confirmPassword) {
      setError(t('register.errors.passwordMismatch'))
      return
    }

    if (formData.newPassword.length < 6) {
      setError(t('register.errors.passwordTooShort'))
      return
    }

    const passwordValidation = validatePassword(formData.newPassword)
    if (!passwordValidation.valid) {
      setError(passwordValidation.message)
      return
    }

    setLoading(true)

    try {
      await authService.resetPassword({
        email: formData.email,
        code: formData.code,
        new_password: formData.newPassword,
      })
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('forgotPassword.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  // 重置成功页面
  if (success) {
    return (
      <div className="min-h-screen bg-paper-gradient flex items-center justify-center p-8">
        <motion.div
          className="w-full max-w-md text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-cyan-ink/20 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <CheckCircle className="w-10 h-10 text-cyan-ink" />
          </motion.div>
          
          <h2 className="text-3xl font-title text-ink-black mb-4">{t('forgotPassword.resetSuccess')}</h2>
          <p className="text-ink-light mb-8">{t('forgotPassword.resetSuccessMessage')}</p>
          
          <Button
            onClick={() => navigate('/auth/login')}
            fullWidth
            size="lg"
          >
            {t('common.backToLogin')}
          </Button>
        </motion.div>

        {/* 语言切换按钮 */}
        <LanguageSwitcher />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper-gradient flex items-center justify-center p-8">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* 返回按钮 */}
        <motion.button
          className="flex items-center gap-2 text-ink-light hover:text-ink-black mb-8 transition-colors"
          onClick={() => navigate('/auth/login')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <ArrowLeft size={20} />
          {t('common.backToLogin')}
        </motion.button>

        {/* 标题 */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-4xl font-title text-ink-black mb-2">{t('forgotPassword.title')}</h2>
          <p className="text-ink-light">{t('forgotPassword.subtitle')}</p>
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
                    placeholder={t('forgotPassword.emailPlaceholder')}
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
              label={t('forgotPassword.newPassword')}
              type="password"
              placeholder={t('forgotPassword.newPasswordPlaceholder')}
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              icon={<Lock size={18} />}
              required
              minLength={6}
            />
            <p className="text-xs text-ink-light mt-1">
              {t('register.passwordHint')}
            </p>
          </div>

          <Input
            label={t('forgotPassword.confirmNewPassword')}
            type="password"
            placeholder={t('forgotPassword.confirmNewPasswordPlaceholder')}
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
          >
            {t('forgotPassword.resetPassword')}
          </Button>
        </motion.form>

        {/* 其他链接 */}
        <motion.div
          className="mt-8 text-center space-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <p className="text-ink-light">
            {t('forgotPassword.rememberPassword')}
            <Link
              to="/auth/login"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              {t('common.backToLogin')}
            </Link>
          </p>
          <p className="text-ink-light">
            {t('login.noAccount')}
            <Link
              to="/auth/register"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              {t('login.registerNow')}
            </Link>
          </p>
        </motion.div>
      </motion.div>

      {/* 语言切换按钮 */}
      <LanguageSwitcher />
    </div>
  )
}
