import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import { authService } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'
import AuthShell from './components/AuthShell'

interface LocationState {
  message?: string
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const state = location.state as LocationState | null
  const successMessage = state?.message || ''

  const redirectPath = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('redirect') || '/chat'
    return raw.startsWith('/') ? raw : '/chat'
  }, [location.search])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authService.login(formData)
      setAuth(response.access_token, response.refresh_token || null, response.user)
      navigate(redirectPath, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      backText={t('common.backToHome')}
      onBack={() => navigate('/')}
      decorativeMain={t('welcome.brand')}
      decorativeSub={t('login.decorativeText')}
      side="right"
      footer={
        <p className="text-center text-sm font-ui text-ink-light">
          {t('login.noAccount')}
          <Link to="/auth/register" className="ml-2 text-vermilion transition-colors hover:text-vermilion-light">
            {t('login.registerNow')}
          </Link>
        </p>
      }
    >
      {successMessage && (
        <div className="mb-4 rounded-md border border-jade/30 bg-jade/10 px-3 py-2 text-sm font-ui text-jade">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-vermilion/30 bg-vermilion/10 px-3 py-2 text-sm font-ui text-vermilion">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('login.username')}
          placeholder={t('login.usernamePlaceholder')}
          value={formData.identifier}
          onChange={(e) => setFormData((prev) => ({ ...prev, identifier: e.target.value }))}
          icon={<User size={18} />}
          required
        />

        <Input
          label={t('login.password')}
          type="password"
          placeholder={t('login.passwordPlaceholder')}
          value={formData.password}
          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
          icon={<Lock size={18} />}
          required
        />

        <div className="pt-1">
          <Button type="submit" fullWidth loading={loading} size="lg">
            {t('common.login')}
          </Button>
        </div>
      </form>

      <div className="mt-4 text-center">
        <Link to="/auth/forgot-password" className="text-sm font-ui text-ink-light transition-colors hover:text-ink-dark">
          {t('login.forgotPassword')}
        </Link>
      </div>
    </AuthShell>
  )
}
