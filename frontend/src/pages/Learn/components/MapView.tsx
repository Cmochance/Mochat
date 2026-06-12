import { useCallback, useState, useEffect } from 'react'
import { Loader2, Sparkles, Network, GitMerge, ZoomIn, ZoomOut, RotateCcw, MessageSquare, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'
import KnowledgeGraph from './KnowledgeGraph'

interface MapViewProps {
  materialId: number
  onAskAboutConcept?: (concept: string) => void
  onViewFlashcards?: () => void
}

export default function MapView({ materialId, onAskAboutConcept, onViewFlashcards }: MapViewProps) {
  const { t } = useTranslation()
  const {
    mindmap,
    conceptGraph,
    mapLoading,
    setMindmap,
    setConceptGraph,
    setMapLoading,
  } = useLearnStore()

  const [mapType, setMapType] = useState<'mindmap' | 'concept_graph' | 'knowledge_base'>('mindmap')
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ label: string; desc: string; nodeType?: string } | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<string[]>([])

  // Zoom & Pan state (for native SVG)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (materialId && mapType !== 'knowledge_base') {
      loadMap()
    }
  }, [materialId, mapType])

  const loadMap = async () => {
    setMapLoading(true)
    try {
      let data
      try {
        data = await learnService.getMap(materialId, mapType as any)
      } catch {
        data = await learnService.generateMap(materialId, mapType as any)
      }
      if (mapType === 'mindmap') setMindmap(data)
      else if (mapType === 'concept_graph') setConceptGraph(data)
    } catch (err) {
      console.error('Failed to load map:', err)
    } finally {
      setMapLoading(false)
    }
  }

  const handleZoom = (factor: number) => {
    setViewBox(prev => ({
      x: prev.x + (prev.w * (1 - factor)) / 2,
      y: prev.y + (prev.h * (1 - factor)) / 2,
      w: prev.w * factor,
      h: prev.h * factor,
    }))
  }

  const handleReset = () => {
    setViewBox({ x: 0, y: 0, w: 800, h: 600 })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = (e.clientX - panStart.x) * (viewBox.w / 800)
      const dy = (e.clientY - panStart.y) * (viewBox.h / 600)
      setViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }))
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => setIsPanning(false)

  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    handleZoom(factor)
  }

  // Layout helpers
  const layoutTree = useCallback((node: any, depth = 0, index = 0, total = 1) => {
    const x = 100 + depth * 180
    const y = 50 + (index / Math.max(total, 1)) * 500
    return { ...node, x, y }
  }, [])

  const layoutForceGraph = useCallback((nodes: any[], _links: any[]) => {
    const positioned: any[] = []
    const angleStep = (2 * Math.PI) / nodes.length
    nodes.forEach((node, i) => {
      positioned.push({
        ...node,
        x: 400 + 200 * Math.cos(i * angleStep),
        y: 300 + 200 * Math.sin(i * angleStep),
      })
    })
    return positioned
  }, [])

  const toggleNode = (nodeId: string) => {
    setCollapsedNodes(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    )
  }

  const renderMindmap = () => {
    if (!mindmap) return null
    const renderNode = (node: any, depth = 0, index = 0, siblingCount = 1): JSX.Element => {
      const pos = layoutTree(node, depth, index, siblingCount)
      const hasChildren = node.children && node.children.length > 0
      const isCollapsed = collapsedNodes.includes(node.label)
      const isSelected = selectedNodeInfo?.label === node.label

      return (
        <g key={node.label}>
          <g
            transform={`translate(${pos.x}, ${pos.y})`}
            onClick={() => {
              setSelectedNodeInfo({ label: node.label, desc: node.description || '' })
              if (hasChildren) toggleNode(node.label)
            }}
            className="cursor-pointer"
          >
            <rect
              x={-60} y={-16} width={120} height={32} rx={4}
              fill={depth === 0 ? '#5B4A3F' : isSelected ? '#D4C8BE' : '#F5EDE4'}
              stroke={isSelected ? '#5B4A3F' : '#C4B5A5'}
              strokeWidth={1.5}
            />
            <text
              textAnchor="middle" dominantBaseline="central"
              fill={depth === 0 ? '#FFF' : '#3D3229'}
              fontSize={depth === 0 ? 13 : 11}
              fontWeight={depth === 0 ? 600 : 400}
            >
              {node.label.length > 10 ? node.label.slice(0, 10) + '…' : node.label}
            </text>
            {hasChildren && (
              <text x={50} y={-8} fontSize={10} fill="#8A7B6B">
                {isCollapsed ? `[+${node.children.length}]` : '[-]'}
              </text>
            )}
          </g>
          {hasChildren && !isCollapsed && node.children.map((child: any, i: number) => (
            <g key={child.label}>
              <path
                d={`M${pos.x + 60},${pos.y} C${pos.x + 120},${pos.y} ${pos.x + 60},${50 + (i / node.children.length) * 500} ${pos.x + 120},${50 + (i / node.children.length) * 500}`}
                fill="none" stroke="#C4B5A5" strokeWidth={1}
              />
              {renderNode(child, depth + 1, i, node.children.length)}
            </g>
          ))}
        </g>
      )
    }

    return (
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {renderNode(mindmap)}
      </svg>
    )
  }

  const renderConceptGraph = () => {
    if (!conceptGraph) return null
    const nodes = layoutForceGraph(conceptGraph.nodes || [], conceptGraph.edges || [])
    const links = conceptGraph.edges || []
    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]))

    return (
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-full select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {links.map((link: any, i: number) => {
          const source = nodeMap.get(link.source)
          const target = nodeMap.get(link.target)
          if (!source || !target) return null
          return (
            <g key={i}>
              <line
                x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                stroke="#C4B5A5" strokeWidth={1}
                markerEnd="url(#arrowhead)"
              />
              <text
                x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6}
                textAnchor="middle" fontSize={9} fill="#8A7B6B"
              >
                {link.label}
              </text>
            </g>
          )
        })}
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX={24} refY={5} markerWidth={6} markerHeight={6} orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#C4B5A5" />
          </marker>
        </defs>
        {nodes.map((node: any) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => setSelectedNodeInfo({ label: node.id, desc: node.properties?.text || '', nodeType: node.labels?.[0] })}
            className="cursor-pointer"
          >
            <circle
              r={Math.min(Math.max(15, (node.properties?.text?.length || 20) / 3), 30)}
              fill={selectedNodeInfo?.label === node.id ? '#D4C8BE' : '#F5EDE4'}
              stroke="#5B4A3F" strokeWidth={1.5}
            />
            <text textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#3D3229">
              {(node.properties?.name || node.id).slice(0, 6)}
            </text>
          </g>
        ))}
      </svg>
    )
  }

  return (
    <div className="flex flex-col h-full bg-paper-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-paper-aged">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMapType('mindmap')}
            className={`px-3 py-1 text-xs rounded-full ${mapType === 'mindmap' ? 'bg-ink-black text-paper-white' : 'text-ink-muted hover:bg-paper-aged'}`}
          >
            <Sparkles size={12} className="mr-1 inline" />
            {t('learn.map.mindmap')}
          </button>
          <button
            onClick={() => setMapType('concept_graph')}
            className={`px-3 py-1 text-xs rounded-full ${mapType === 'concept_graph' ? 'bg-ink-black text-paper-white' : 'text-ink-muted hover:bg-paper-aged'}`}
          >
            <Network size={12} className="mr-1 inline" />
            {t('learn.map.conceptGraph')}
          </button>
          <button
            onClick={() => setMapType('knowledge_base')}
            className={`px-3 py-1 text-xs rounded-full ${mapType === 'knowledge_base' ? 'bg-ink-black text-paper-white' : 'text-ink-muted hover:bg-paper-aged'}`}
          >
            <GitMerge size={12} className="mr-1 inline" />
            知识图谱 (RAG)
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => handleZoom(1.2)} className="p-1.5 text-ink-muted hover:text-ink-black"><ZoomIn size={14} /></button>
          <button onClick={() => handleZoom(0.8)} className="p-1.5 text-ink-muted hover:text-ink-black"><ZoomOut size={14} /></button>
          <button onClick={handleReset} className="p-1.5 text-ink-muted hover:text-ink-black"><RotateCcw size={14} /></button>
        </div>
      </div>

      {/* Map Content */}
      <div className="flex-1 overflow-hidden">
        {mapLoading && mapType !== 'knowledge_base' ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-ink-faint" />
            <span className="ml-2 text-ink-faint">正在生成...</span>
          </div>
        ) : mapType === 'knowledge_base' ? (
          <KnowledgeGraph onNodeClick={(name) => onAskAboutConcept?.(name)} />
        ) : mapType === 'mindmap' ? (
          renderMindmap()
        ) : (
          renderConceptGraph()
        )}
      </div>

      {/* Info Panel */}
      <div className="p-3 border-t border-paper-aged bg-paper-cream text-xs">
        {selectedNodeInfo ? (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-ink-black">{selectedNodeInfo.label}</span>
              <span className="text-ink-faint bg-paper-aged px-1.5 py-0.5 rounded text-[10px]">
                {selectedNodeInfo.nodeType || '节点'}
              </span>
            </div>
            <p className="text-ink-muted mb-2 line-clamp-2">{selectedNodeInfo.desc || '暂无描述'}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onAskAboutConcept?.(selectedNodeInfo.label)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-ink-black
                           border border-paper-aged rounded-sm hover:bg-paper-aged transition-colors"
              >
                <MessageSquare size={12} />
                {t('learn.map.askAbout')}
              </button>
              <button
                onClick={() => onViewFlashcards?.()}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-ink-black
                           border border-paper-aged rounded-sm hover:bg-paper-aged transition-colors"
              >
                <Layers size={12} />
                {t('learn.map.viewFlashcards')}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-faint italic">{t('learn.map.infoHint')}</p>
        )}
      </div>
    </div>
  )
}
