import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowLeft, Send, Shield, CheckCircle } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import { authService } from '../../services/authService'

export default function ForgotPassword() {
  const navigate = useNavigate()
  
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
      return { valid: false, message: '失败，密码不支持特殊符号！' }
    }
    
    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /[0-9]/.test(password)
    const typeCount = [hasLower, hasUpper, hasDigit].filter(Boolean).length
    
    if (typeCount < 2) {
      return { valid: false, message: '密码必须至少包含数字、小写字母、大写字母中的两种' }
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
      setError('请先输入邮箱地址')
      return
    }
    
    if (!isValidEmail(formData.email)) {
      setError('请输入有效的邮箱地址')
      return
    }

    setSendingCode(true)
    setError('')

    try {
      const response = await authService.sendVerificationCode(formData.email, 'reset_password')
      setCodeSent(true)
      setCountdown(response.cooldown || 60)
    } catch (err: any) {
      setError(err.response?.data?.detail || '发送验证码失败，请稍后重试')
    } finally {
      setSendingCode(false)
    }
  }, [formData.email])

  // 提交重置
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 验证必填项
    if (!formData.code) {
      setError('请输入验证码')
      return
    }

    if (formData.code.length !== 6 || !/^\d{6}$/.test(formData.code)) {
      setError('请输入6位数字验证码')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (formData.newPassword.length < 6) {
      setError('密码长度至少6位')
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
      setError(err.response?.data?.detail || '重置密码失败，请稍后重试')
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
          
          <h2 className="text-3xl font-title text-ink-black mb-4">密码重置成功</h2>
          <p className="text-ink-light mb-8">您的密码已成功重置，请使用新密码登录</p>
          
          <Button
            onClick={() => navigate('/auth/login')}
            fullWidth
            size="lg"
          >
            返回登录
          </Button>
        </motion.div>
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
          返回登录
        </motion.button>

        {/* 标题 */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-4xl font-title text-ink-black mb-2">忘记密码</h2>
          <p className="text-ink-light">通过邮箱验证码重置您的密码</p>
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
            <label className="block text-sm font-medium text-ink-dark mb-2">邮箱</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light">
                    <Mail size={18} />
                  </span>
                  <input
                    type="email"
                    placeholder="请输入注册时使用的邮箱"
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
                {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}秒` : '发送验证码'}
              </button>
            </div>
            {codeSent && countdown > 0 && (
              <p className="text-xs text-cyan-ink mt-2">
                验证码已发送至您的邮箱，请查收（5分钟内有效）
              </p>
            )}
          </div>

          {/* 验证码输入 */}
          <div>
            <label className="block text-sm font-medium text-ink-dark mb-2">验证码</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light">
                <Shield size={18} />
              </span>
              <input
                type="text"
                placeholder="请输入6位数字验证码"
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
              label="新密码"
              type="password"
              placeholder="请输入新密码（至少6位）"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              icon={<Lock size={18} />}
              required
              minLength={6}
            />
            <p className="text-xs text-ink-light mt-1">
              仅支持数字/小写字母/大写字母，且至少包含其中两种
            </p>
          </div>

          <Input
            label="确认新密码"
            type="password"
            placeholder="请再次输入新密码"
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
            重置密码
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
            想起密码了？
            <Link
              to="/auth/login"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              返回登录
            </Link>
          </p>
          <p className="text-ink-light">
            还没有账号？
            <Link
              to="/auth/register"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              立即注册
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
