import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageCircle, Sparkles, Shield, Zap } from 'lucide-react'
import Button from '../../components/common/Button'
import { useAuthStore } from '../../stores/authStore'

export default function Welcome() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  const features = [
    {
      icon: <MessageCircle className="w-8 h-8" />,
      title: '智能对话',
      description: '与AI进行自然流畅的对话，获取知识与灵感',
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: '思维可见',
      description: '独特的思考过程展示，了解AI的推理逻辑',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: '流式输出',
      description: '实时流式响应，让对话如行云流水般顺畅',
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: '安全可靠',
      description: '数据加密存储，保护您的隐私与安全',
    },
  ]

  return (
    <div className="min-h-screen bg-paper-gradient overflow-hidden">
      {/* 水墨背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-ink-black/5 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-cyan-ink/5 blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.5, 0.3, 0.5],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* 导航栏 */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Logo */}
          <div className="w-10 h-10 rounded-full bg-ink-black flex items-center justify-center">
            <span className="text-paper-white font-title text-xl">墨</span>
          </div>
          <span className="text-2xl font-title text-ink-black">墨聊</span>
        </motion.div>

        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {isAuthenticated ? (
            <Button onClick={() => navigate('/chat')}>
              进入对话
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate('/auth/login')}>
                登录
              </Button>
              <Button variant="seal" onClick={() => navigate('/auth/register')}>
                注册
              </Button>
            </>
          )}
        </motion.div>
      </nav>

      {/* 主内容区 */}
      <main className="relative z-10 container mx-auto px-8 py-16">
        {/* Hero Section */}
        <motion.div
          className="text-center max-w-4xl mx-auto mb-24"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <h1 className="text-6xl md:text-8xl font-title text-ink-black mb-6 leading-tight">
            墨聊
          </h1>
          <p className="text-xl md:text-2xl text-ink-medium font-body mb-4">
            Mochat
          </p>
          <p className="text-lg text-ink-light font-body max-w-2xl mx-auto mb-12">
            水墨之间，智慧流淌。在传统与现代的交融中，开启与AI的对话之旅。
          </p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Button
              size="lg"
              onClick={() => navigate(isAuthenticated ? '/chat' : '/auth/register')}
            >
              {isAuthenticated ? '开始对话' : '立即体验'}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              了解更多
            </Button>
          </motion.div>
        </motion.div>

        {/* 特性展示 */}
        <motion.section
          id="features"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-24"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="ink-card p-6 text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
              whileHover={{ y: -5 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-paper-cream flex items-center justify-center text-ink-black">
                {feature.icon}
              </div>
              <h3 className="text-xl font-title text-ink-black mb-2">
                {feature.title}
              </h3>
              <p className="text-ink-light text-sm">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.section>

        {/* 装饰性水墨元素 */}
        <motion.div
          className="flex justify-center gap-8 opacity-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 1, delay: 1 }}
        >
          {['诗', '书', '画', '印'].map((char, index) => (
            <span
              key={char}
              className="text-4xl font-title text-ink-black"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              {char}
            </span>
          ))}
        </motion.div>
      </main>

      {/* 页脚 */}
      <footer className="relative z-10 text-center py-8 text-ink-light text-sm">
        <p>© 2026 墨聊 Mochat. 水墨风格AI对话平台</p>
      </footer>
    </div>
  )
}
