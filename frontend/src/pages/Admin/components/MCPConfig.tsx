import { useEffect, useState } from 'react'
import { RefreshCw, Server, PlugZap, Plus, Trash2, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/common/Button'
import Input from '../../../components/common/Input'
import {
  adminService,
  type MCPServerConfig,
  type MCPToolConfig,
  type MCPResourceInfo,
  type MCPPromptInfo,
} from '../../../services/adminService'

type Transport = 'remote' | 'stdio'

export default function MCPConfig() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [tools, setTools] = useState<MCPToolConfig[]>([])
  const [resources, setResources] = useState<MCPResourceInfo[]>([])
  const [prompts, setPrompts] = useState<MCPPromptInfo[]>([])
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingResources, setLoadingResources] = useState(false)
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  const [name, setName] = useState('')
  const [transport, setTransport] = useState<Transport>('remote')
  const [baseUrl, setBaseUrl] = useState('')
  const [command, setCommand] = useState('')
  const [argsJson, setArgsJson] = useState('[]')
  const [headersJson, setHeadersJson] = useState('{}')
  const [envJson, setEnvJson] = useState('{}')
  const [bearerToken, setBearerToken] = useState('')

  const loadServers = async () => {
    setLoading(true)
    try {
      const data = await adminService.getMcpServers()
      setServers(data)
      if (!selectedServerId && data.length > 0) {
        setSelectedServerId(data[0].id)
      }
      if (selectedServerId && data.every((item) => item.id !== selectedServerId)) {
        setSelectedServerId(data[0]?.id ?? null)
      }
    } catch (error) {
      console.error('加载 MCP 服务器失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTools = async (serverId: number) => {
    try {
      const data = await adminService.getMcpTools(serverId)
      setTools(data)
    } catch (error) {
      console.error('加载 MCP 工具失败:', error)
      setTools([])
    }
  }

  useEffect(() => {
    void loadServers()
  }, [])

  useEffect(() => {
    if (selectedServerId) {
      void loadTools(selectedServerId)
      setResources([])
      setPrompts([])
    } else {
      setTools([])
      setResources([])
      setPrompts([])
    }
  }, [selectedServerId])

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await adminService.createMcpServer({
        name: name.trim(),
        transport,
        base_url: transport === 'remote' ? baseUrl.trim() : undefined,
        command: transport === 'stdio' ? command.trim() : undefined,
        args_json: transport === 'stdio' ? argsJson.trim() : undefined,
        env_json: envJson.trim() || undefined,
        headers_json: transport === 'remote' ? headersJson.trim() : undefined,
        bearer_token: bearerToken.trim() || undefined,
      })
      setName('')
      setBaseUrl('')
      setCommand('')
      setArgsJson('[]')
      setHeadersJson('{}')
      setEnvJson('{}')
      setBearerToken('')
      await loadServers()
    } catch (error) {
      console.error('创建 MCP 服务器失败:', error)
      alert('创建失败，请检查配置')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (serverId: number) => {
    if (!confirm('确定删除该 MCP 服务器吗？')) return
    try {
      await adminService.deleteMcpServer(serverId)
      await loadServers()
    } catch (error) {
      console.error('删除 MCP 服务器失败:', error)
    }
  }

  const handleToggleActive = async (server: MCPServerConfig) => {
    try {
      await adminService.updateMcpServer(server.id, { is_active: !server.is_active })
      await loadServers()
    } catch (error) {
      console.error('更新 MCP 状态失败:', error)
    }
  }

  const handleRefreshTools = async (serverId: number) => {
    try {
      await adminService.refreshMcpTools(serverId)
      await loadTools(serverId)
      await loadServers()
    } catch (error) {
      console.error('刷新工具失败:', error)
      alert('刷新失败，请检查 MCP server 可达性')
    }
  }

  const handleTestServer = async (serverId: number) => {
    try {
      const result = await adminService.testMcpServer(serverId)
      alert(`连接成功，耗时 ${result.latency_ms}ms，工具数 ${result.tools}`)
    } catch (error) {
      console.error('测试连接失败:', error)
      alert('连接失败，请检查配置')
    }
  }

  const handleLoadResources = async () => {
    if (!selectedServerId) return
    setLoadingResources(true)
    try {
      const data = await adminService.getMcpResources(selectedServerId)
      setResources(data)
    } catch (error) {
      console.error('加载 MCP resources 失败:', error)
      setResources([])
    } finally {
      setLoadingResources(false)
    }
  }

  const handleLoadPrompts = async () => {
    if (!selectedServerId) return
    setLoadingPrompts(true)
    try {
      const data = await adminService.getMcpPrompts(selectedServerId)
      setPrompts(data)
    } catch (error) {
      console.error('加载 MCP prompts 失败:', error)
      setPrompts([])
    } finally {
      setLoadingPrompts(false)
    }
  }

  const handleToggleTool = async (tool: MCPToolConfig, key: 'is_enabled' | 'requires_approval') => {
    if (!selectedServerId) return
    try {
      await adminService.updateMcpToolFlags(selectedServerId, tool.tool_name, {
        [key]: !tool[key],
      })
      await loadTools(selectedServerId)
    } catch (error) {
      console.error('更新工具开关失败:', error)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-title text-ink-black">MCP Configuration</h2>

      <div className="ink-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-ink-black">
          <Plus size={16} />
          <span className="font-medium">Add MCP Server</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Server name" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            className="h-11 rounded-md border border-paper-aged bg-paper-white px-3 text-sm text-ink-black"
            value={transport}
            onChange={(e) => setTransport(e.target.value as Transport)}
          >
            <option value="remote">remote</option>
            <option value="stdio">stdio</option>
          </select>
          {transport === 'remote' ? (
            <>
              <Input placeholder="https://example.com/mcp" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <Input placeholder='{"X-API-Key":"..."}' value={headersJson} onChange={(e) => setHeadersJson(e.target.value)} />
            </>
          ) : (
            <>
              <Input placeholder="command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)} />
              <Input placeholder='args json (e.g. ["-y","@modelcontextprotocol/server-filesystem","D:/data"])' value={argsJson} onChange={(e) => setArgsJson(e.target.value)} />
            </>
          )}
          <Input placeholder='env json (e.g. {"NODE_ENV":"production"})' value={envJson} onChange={(e) => setEnvJson(e.target.value)} />
          <Input type="password" placeholder="Bearer token (optional)" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleCreate} loading={saving}>
            <PlugZap size={16} />
            Create
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="ink-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-ink-black">
              <Server size={16} />
              <span className="font-medium">Servers</span>
            </div>
            <Button variant="ghost" onClick={loadServers} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>

          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`rounded-md border p-3 ${selectedServerId === server.id ? 'border-ink-black' : 'border-paper-aged'}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => setSelectedServerId(server.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-ui text-sm text-ink-black">{server.name}</p>
                      <p className="text-xs text-ink-light">{server.transport} · tools {server.tool_count || 0}</p>
                    </div>
                    <span className={`text-xs ${server.is_active ? 'text-emerald-600' : 'text-ink-light'}`}>
                      {server.is_active ? t('common.enabled') : t('common.disabled')}
                    </span>
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleToggleActive(server)}>
                    {server.is_active ? t('common.disable') : t('common.enable')}
                  </Button>
                  <Button variant="ghost" onClick={() => handleTestServer(server.id)}>Test</Button>
                  <Button variant="ghost" onClick={() => void handleRefreshTools(server.id)}>Sync Tools</Button>
                  <Button variant="ghost" onClick={() => handleDelete(server.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            {!servers.length && <p className="text-sm text-ink-light">No MCP servers configured.</p>}
          </div>
        </div>

        <div className="ink-card p-4">
          <div className="mb-3 flex items-center justify-between text-ink-black">
            <div className="flex items-center gap-2">
              <Wrench size={16} />
              <span className="font-medium">Tools / Resources / Prompts</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => void handleLoadResources()} disabled={!selectedServerId || loadingResources}>
                {loadingResources ? 'Loading...' : 'Load Resources'}
              </Button>
              <Button variant="ghost" onClick={() => void handleLoadPrompts()} disabled={!selectedServerId || loadingPrompts}>
                {loadingPrompts ? 'Loading...' : 'Load Prompts'}
              </Button>
            </div>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            <p className="text-xs font-medium text-ink-black">Tools</p>
            {tools.map((tool) => (
              <div key={tool.tool_name} className="rounded-md border border-paper-aged p-3">
                <p className="text-sm font-ui text-ink-black">{tool.tool_name}</p>
                <p className="text-xs text-ink-light mt-1 line-clamp-2">{tool.description || 'No description'}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={tool.is_enabled}
                      onChange={() => void handleToggleTool(tool, 'is_enabled')}
                    />
                    enabled
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={tool.requires_approval}
                      onChange={() => void handleToggleTool(tool, 'requires_approval')}
                    />
                    require approval
                  </label>
                </div>
              </div>
            ))}
            {!selectedServerId && <p className="text-sm text-ink-light">Select a server to view tools.</p>}
            {selectedServerId && !tools.length && <p className="text-sm text-ink-light">No tools cached. Click Sync Tools.</p>}

            <div className="pt-2">
              <p className="mb-2 text-xs font-medium text-ink-black">Resources</p>
              {resources.map((resource) => (
                <div key={resource.uri} className="mb-2 rounded-md border border-paper-aged p-2">
                  <p className="text-xs text-ink-black">{resource.name}</p>
                  <p className="text-[11px] text-ink-light break-all">{resource.uri}</p>
                </div>
              ))}
              {!resources.length && <p className="text-xs text-ink-light">No resources loaded.</p>}
            </div>

            <div className="pt-2">
              <p className="mb-2 text-xs font-medium text-ink-black">Prompts</p>
              {prompts.map((prompt) => (
                <div key={prompt.name} className="mb-2 rounded-md border border-paper-aged p-2">
                  <p className="text-xs text-ink-black">{prompt.name}</p>
                  <p className="text-[11px] text-ink-light">{prompt.description || 'No description'}</p>
                </div>
              ))}
              {!prompts.length && <p className="text-xs text-ink-light">No prompts loaded.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
