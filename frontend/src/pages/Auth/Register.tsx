import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Send, Shield, User, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import { authService } from '../../services/authService'
import AuthShell from './components/AuthShell'

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
      const response = await authService.sendVerificationCode(formData.email, 'register')
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
      navigate('/auth/login', { state: { message: t('register.registerSuccess') } })
    } catch (err: any) {
      setError(err.response?.data?.detail || t('register.errors.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      backText={t('common.backToHome')}
      onBack={() => navigate('/')}
      decorativeMain={t('register.decorativeChar')}
      decorativeSub={
        <>
          {t('register.decorativeText1')}
          <br />
          {t('register.decorativeText2')}
        </>
      }
      side="left"
      footer={
        <p className="text-center text-sm font-ui text-ink-light">
          {t('register.hasAccount')}
          <Link to="/auth/login" className="ml-2 text-vermilion transition-colors hover:text-vermilion-light">
            {t('register.loginNow')}
          </Link>
        </p>
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-vermilion/30 bg-vermilion/10 px-3 py-2 text-sm font-ui text-vermilion">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('register.username')}
          placeholder={t('register.usernamePlaceholder')}
          value={formData.username}
          onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
          icon={<User size={18} />}
          required
          minLength={2}
          maxLength={50}
        />

        <div>
          <label className="mb-1 block text-sm font-ui text-ink-medium">{t('register.email')}</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder={t('register.emailPlaceholder')}
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
              className="shrink-0"
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
          label={t('register.password')}
          type="password"
          placeholder={t('register.passwordPlaceholder')}
          value={formData.password}
          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
          icon={<Lock size={18} />}
          hint={t('register.passwordHint')}
          required
          minLength={6}
        />

        <Input
          label={t('register.confirmPassword')}
          type="password"
          placeholder={t('register.confirmPasswordPlaceholder')}
          value={formData.confirmPassword}
          onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          icon={<Lock size={18} />}
          required
        />

        <div className="pt-1">
          <Button type="submit" fullWidth loading={loading} size="lg" variant="seal">
            {t('common.register')}
          </Button>
        </div>
      </form>
    </AuthShell>
  )
}
