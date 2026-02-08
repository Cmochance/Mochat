import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import LanguageSwitcher from '../../components/common/LanguageSwitcher'
import { authService } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { t } = useTranslation()
  
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authService.login(formData)
      setAuth(response.access_token, response.refresh_token || null, response.user)
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper-gradient flex">
      {/* 左侧装饰区 */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 bg-ink-black items-center justify-center relative overflow-hidden"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* 水墨背景效果 */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-white/5 blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-vermilion/10 blur-3xl"
            animate={{
              scale: [1.3, 1, 1.3],
              opacity: [0.5, 0.3, 0.5],
            }}
            transition={{ duration: 6, repeat: Infinity }}
          />
        </div>

        <div className="relative z-10 text-center text-paper-white p-12">
          <motion.h1
            className="text-8xl font-title mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {t('welcome.brand')}
          </motion.h1>
          <motion.p
            className="text-xl text-paper-cream/80"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {t('login.decorativeText')}
          </motion.p>
        </div>
      </motion.div>

      {/* 右侧登录区 */}
      <motion.div
        className="w-full lg:w-1/2 flex items-center justify-center p-8"
        initial={{ x: 100, opacity: 0 }}
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
            <h2 className="text-4xl font-title text-ink-black mb-2">{t('login.title')}</h2>
            <p className="text-ink-light">{t('login.subtitle')}</p>
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
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Input
              label={t('login.username')}
              placeholder={t('login.usernamePlaceholder')}
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
              icon={<User size={18} />}
              required
            />

            <Input
              label={t('login.password')}
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              icon={<Lock size={18} />}
              required
            />

            <Button
              type="submit"
              fullWidth
              loading={loading}
              size="lg"
            >
              {t('common.login')}
            </Button>
          </motion.form>

          {/* 忘记密码链接 */}
          <motion.div
            className="mt-4 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <Link
              to="/auth/forgot-password"
              className="text-sm text-ink-light hover:text-ink-dark transition-colors"
            >
              {t('login.forgotPassword')}
            </Link>
          </motion.div>

          {/* 注册链接 */}
          <motion.p
            className="mt-6 text-center text-ink-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {t('login.noAccount')}
            <Link
              to="/auth/register"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              {t('login.registerNow')}
            </Link>
          </motion.p>
        </div>
      </motion.div>

      {/* 语言切换按钮 */}
      <LanguageSwitcher />
    </div>
  )
}
