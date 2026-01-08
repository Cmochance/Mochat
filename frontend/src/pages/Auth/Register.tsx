import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, Mail, ArrowLeft } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import { authService } from '../../services/authService'

export default function Register() {
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 验证密码格式
  const validatePassword = (password: string): { valid: boolean; message: string } => {
    // 检查是否只包含数字、小写字母、大写字母
    if (!/^[a-zA-Z0-9]+$/.test(password)) {
      return { valid: false, message: '失败，密码不支持特殊符号！' }
    }
    
    // 检查是否至少包含两种字符类型
    const hasLower = /[a-z]/.test(password)
    const hasUpper = /[A-Z]/.test(password)
    const hasDigit = /[0-9]/.test(password)
    const typeCount = [hasLower, hasUpper, hasDigit].filter(Boolean).length
    
    if (typeCount < 2) {
      return { valid: false, message: '密码必须至少包含数字、小写字母、大写字母中的两种' }
    }
    
    return { valid: true, message: '' }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 验证密码
    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (formData.password.length < 6) {
      setError('密码长度至少6位')
      return
    }

    // 验证密码格式
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
      })
      // 注册成功，跳转到登录页
      navigate('/auth/login', { 
        state: { message: '注册成功，请登录' } 
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || '注册失败，请稍后重试')
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
            返回首页
          </motion.button>

          {/* 标题 */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-4xl font-title text-ink-black mb-2">注册</h2>
            <p className="text-ink-light">创建账号，开启智慧对话</p>
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
              label="用户名"
              placeholder="请输入用户名（2-50字符）"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              icon={<User size={18} />}
              required
              minLength={2}
              maxLength={50}
            />

            <Input
              label="邮箱"
              type="email"
              placeholder="请输入邮箱地址"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              icon={<Mail size={18} />}
              required
            />

            <div>
              <Input
                label="密码"
                type="password"
                placeholder="请输入密码（至少6位）"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                icon={<Lock size={18} />}
                required
                minLength={6}
              />
              <p className="text-xs text-ink-light mt-1">
                仅支持数字/小写字母/大写字母，且至少包含其中两种
              </p>
            </div>

            <Input
              label="确认密码"
              type="password"
              placeholder="请再次输入密码"
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
              注册
            </Button>
          </motion.form>

          {/* 登录链接 */}
          <motion.p
            className="mt-8 text-center text-ink-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            已有账号？
            <Link
              to="/auth/login"
              className="text-vermilion hover:text-vermilion-light ml-2 transition-colors"
            >
              立即登录
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
            聊
          </motion.div>
          <motion.p
            className="text-xl text-paper-cream/80 max-w-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            与智慧对话<br />在水墨间探寻真知
          </motion.p>
        </div>
      </motion.div>
    </div>
  )
}
