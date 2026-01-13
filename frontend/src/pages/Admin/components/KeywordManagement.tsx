import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  AlertTriangle,
  Shield,
  Search
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import type { RestrictedKeyword } from '../../../types'
import Button from '../../../components/common/Button'
import Input from '../../../components/common/Input'

export default function KeywordManagement() {
  const [keywords, setKeywords] = useState<RestrictedKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [newKeyword, setNewKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadKeywords()
  }, [])

  const loadKeywords = async () => {
    setLoading(true)
    try {
      const data = await adminService.getKeywords()
      setKeywords(data)
    } catch (err) {
      console.error('加载限制词失败:', err)
      setError('加载限制词失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return
    
    setAdding(true)
    setError(null)
    try {
      const keyword = await adminService.addKeyword(newKeyword.trim())
      setKeywords([keyword, ...keywords])
      setNewKeyword('')
    } catch (err: any) {
      setError(err.response?.data?.detail || '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteKeyword = async (id: number) => {
    if (!confirm('确定要删除这个限制词吗？')) return
    
    try {
      await adminService.deleteKeyword(id)
      setKeywords(keywords.filter(k => k.id !== id))
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  const handleToggleStatus = async (id: number) => {
    try {
      const updated = await adminService.toggleKeywordStatus(id)
      setKeywords(keywords.map(k => k.id === id ? updated : k))
    } catch (err) {
      console.error('切换状态失败:', err)
    }
  }

  const filteredKeywords = keywords.filter(k => 
    k.keyword.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activeCount = keywords.filter(k => k.is_active).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-vermilion border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 头部统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          className="bg-white border border-ink-light/30 p-4 rounded-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-vermilion/10 rounded-sm">
              <Shield className="text-vermilion" size={20} />
            </div>
            <div>
              <p className="text-sm text-ink-light">总限制词</p>
              <p className="text-2xl font-title text-ink-black">{keywords.length}</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="bg-white border border-ink-light/30 p-4 rounded-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-sm">
              <ToggleRight className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-ink-light">已启用</p>
              <p className="text-2xl font-title text-ink-black">{activeCount}</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="bg-white border border-ink-light/30 p-4 rounded-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-sm">
              <ToggleLeft className="text-gray-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-ink-light">已禁用</p>
              <p className="text-2xl font-title text-ink-black">{keywords.length - activeCount}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 添加新限制词 */}
      <motion.div 
        className="bg-white border border-ink-light/30 p-4 rounded-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-title mb-4 flex items-center gap-2">
          <Plus size={20} className="text-vermilion" />
          添加限制词
        </h3>
        
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="输入要限制的关键词..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
            />
          </div>
          <Button
            onClick={handleAddKeyword}
            loading={adding}
            disabled={!newKeyword.trim()}
          >
            添加
          </Button>
        </div>

        {error && (
          <motion.p 
            className="mt-2 text-vermilion text-sm flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertTriangle size={14} />
            {error}
          </motion.p>
        )}

        <p className="mt-3 text-sm text-ink-light">
          提示：当用户输入或 AI 回复中包含限制词时，将显示 "受地区限制，部分内容无法显示。"
        </p>
      </motion.div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-light" size={18} />
        <input
          type="text"
          placeholder="搜索限制词..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-ink-light/30 rounded-sm focus:border-vermilion focus:outline-none"
        />
      </div>

      {/* 限制词列表 */}
      <motion.div 
        className="bg-white border border-ink-light/30 rounded-sm overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="border-b border-ink-light/30 px-4 py-3 bg-paper-cream/50">
          <h3 className="font-title">限制词列表</h3>
        </div>

        {filteredKeywords.length === 0 ? (
          <div className="p-8 text-center text-ink-light">
            {searchTerm ? '没有找到匹配的限制词' : '暂无限制词，点击上方添加'}
          </div>
        ) : (
          <div className="divide-y divide-ink-light/20">
            <AnimatePresence>
              {filteredKeywords.map((keyword, index) => (
                <motion.div
                  key={keyword.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-paper-cream/30"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      px-2 py-0.5 rounded-sm text-xs
                      ${keyword.is_active 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-500'
                      }
                    `}>
                      {keyword.is_active ? '启用' : '禁用'}
                    </span>
                    <span className="font-mono text-ink-black">{keyword.keyword}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-light mr-2">
                      {new Date(keyword.created_at).toLocaleDateString()}
                    </span>
                    
                    <button
                      onClick={() => handleToggleStatus(keyword.id)}
                      className={`
                        p-1.5 rounded-sm transition-colors
                        ${keyword.is_active 
                          ? 'text-green-600 hover:bg-green-50' 
                          : 'text-gray-400 hover:bg-gray-50'
                        }
                      `}
                      title={keyword.is_active ? '禁用' : '启用'}
                    >
                      {keyword.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>

                    <button
                      onClick={() => handleDeleteKeyword(keyword.id)}
                      className="p-1.5 text-vermilion hover:bg-vermilion/10 rounded-sm transition-colors"
                      title="删除"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  )
}
