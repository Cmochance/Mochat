import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle, Lock, Mail, Send, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import { authService } from '../../services/authService'
import AuthShell from './components/AuthShell'

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

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [countdown])

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

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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

  if (success) {
    return (
      <div className="min-h-screen bg-canvas-gradient flex items-center justify-center p-8">
        <div className="w-full max-w-md rounded-lg border border-line-soft bg-paper-white/90 p-8 text-center shadow-panel">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-ink/15">
            <CheckCircle className="text-cyan-ink" />
          </div>
          <h2 className="text-3xl font-title text-ink-black">{t('forgotPassword.resetSuccess')}</h2>
          <p className="mt-2 text-sm font-ui text-text-secondary">{t('forgotPassword.resetSuccessMessage')}</p>
          <div className="mt-6">
            <Button onClick={() => navigate('/auth/login')} fullWidth size="lg">
              {t('common.backToLogin')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AuthShell
      title={t('forgotPassword.title')}
      subtitle={t('forgotPassword.subtitle')}
      backText={t('common.backToLogin')}
      onBack={() => navigate('/auth/login')}
      decorativeMain={t('welcome.brand')}
      decorativeSub={t('welcome.description')}
      side="right"
      footer={
        <div className="space-y-2 text-center text-sm font-ui text-ink-light">
          <p>
            {t('forgotPassword.rememberPassword')}
            <Link to="/auth/login" className="ml-2 text-vermilion transition-colors hover:text-vermilion-light">
              {t('common.backToLogin')}
            </Link>
          </p>
          <p>
            {t('login.noAccount')}
            <Link to="/auth/register" className="ml-2 text-vermilion transition-colors hover:text-vermilion-light">
              {t('login.registerNow')}
            </Link>
          </p>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-vermilion/30 bg-vermilion/10 px-3 py-2 text-sm font-ui text-vermilion">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-ui text-ink-medium">{t('register.email')}</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder={t('forgotPassword.emailPlaceholder')}
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                icon={<Mail size={18} />}
                required
                type="email"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendCode}
              disabled={sendingCode || countdown > 0 || !formData.email}
            >
              <Send size={14} />
              {sendingCode ? t('register.sending') : countdown > 0 ? `${countdown}s` : t('register.sendCode')}
            </Button>
          </div>
          {codeSent && countdown > 0 && (
            <p className="mt-1 text-xs font-ui text-cyan-ink">{t('register.codeSent')}</p>
          )}
        </div>

        <Input
          label={t('register.verificationCode')}
          placeholder={t('register.codePlaceholder')}
          value={formData.code}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 6)
            setFormData((prev) => ({ ...prev, code: value }))
          }}
          icon={<Shield size={18} />}
          className="font-mono tracking-[0.45em]"
          required
          maxLength={6}
        />

        <Input
          label={t('forgotPassword.newPassword')}
          type="password"
          placeholder={t('forgotPassword.newPasswordPlaceholder')}
          value={formData.newPassword}
          onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
          icon={<Lock size={18} />}
          hint={t('register.passwordHint')}
          required
          minLength={6}
        />

        <Input
          label={t('forgotPassword.confirmNewPassword')}
          type="password"
          placeholder={t('forgotPassword.confirmNewPasswordPlaceholder')}
          value={formData.confirmPassword}
          onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          icon={<Lock size={18} />}
          required
        />

        <div className="pt-1">
          <Button type="submit" fullWidth loading={loading} size="lg">
            {t('forgotPassword.resetPassword')}
          </Button>
        </div>
      </form>
    </AuthShell>
  )
}
