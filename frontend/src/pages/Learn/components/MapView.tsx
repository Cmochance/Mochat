import { useCallback, useState, useEffect } from 'react'
import { Loader2, Sparkles, Network, GitMerge, Info, ZoomIn, ZoomOut, RotateCcw, MessageSquare, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLearnStore } from '../../../stores/learnStore'
import { learnService } from '../../../services/learnService'
import type { MindmapNode } from '../../../types'

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

  const [mapType, setMapType] = useState<'mindmap' | 'concept_graph'>('mindmap')
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ label: string; desc: string; nodeType?: string } | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<string[]>([])

  // Zoom & Pan state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Reset zoom & pan when switching maps
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [mapType])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = 1.1
    const nextScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor
    setScale(Math.max(0.3, Math.min(3, nextScale)))
  }

  const handleZoomIn = () => setScale((s) => Math.min(3, s * 1.2))
  const handleZoomOut = () => setScale((s) => Math.max(0.3, s / 1.2))
  const handleResetZoom = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const handleLoadMap = useCallback(async (type: 'mindmap' | 'concept_graph') => {
    setMapLoading(true)
    setSelectedNodeInfo(null)
    try {
      const res = await learnService.getMap(materialId, type)
      const data = JSON.parse(res.map_data)
      if (type === 'mindmap') {
        setMindmap(data)
      } else {
        setConceptGraph(data)
      }
    } catch {
      if (type === 'mindmap') {
        setMindmap(null)
      } else {
        setConceptGraph(null)
      }
    } finally {
      setMapLoading(false)
    }
  }, [materialId, setMindmap, setConceptGraph, setMapLoading])

  const handleGenerateMap = async () => {
    setMapLoading(true)
    setSelectedNodeInfo(null)
    try {
      const res = await learnService.generateMap(materialId, mapType)
      const data = JSON.parse(res.map_data)
      if (mapType === 'mindmap') {
        setMindmap(data)
      } else {
        setConceptGraph(data)
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('learn.map.generateError'))
    } finally {
      setMapLoading(false)
    }
  }

  useEffect(() => {
    handleLoadMap(mapType)
  }, [mapType, handleLoadMap])

  const toggleCollapse = (nodePath: string) => {
    setCollapsedNodes((prev) =>
      prev.includes(nodePath)
        ? prev.filter((p) => p !== nodePath)
        : [...prev, nodePath]
    )
  }

  // ============ 1. 思维导图树形排版布局 ============
  const renderMindmapSVG = () => {
    if (!mindmap) return null

    const svgHeight = 500
    const startX = 60
    const levelWidth = 180

    // 铺平树形结构并计算垂直空间
    interface FlatNode {
      id: string
      topic: string
      depth: number
      children: FlatNode[]
      parentX?: number
      parentY?: number
      x?: number
      y?: number
      isCollapsed?: boolean
    }

    const buildFlatTree = (node: MindmapNode, depth = 0, path = 'root'): FlatNode => {
      const isCollapsed = collapsedNodes.includes(path)
      return {
        id: path,
        topic: node.topic,
        depth,
        isCollapsed,
        children: isCollapsed
          ? []
          : (node.children || []).map((child, i) => buildFlatTree(child, depth + 1, `${path}-${i}`)),
      }
    }

    const flatRoot = buildFlatTree(mindmap)

    // 分配叶子节点数，用于计算垂直位置
    const getLeafCount = (node: FlatNode): number => {
      if (node.children.length === 0) return 1
      return node.children.reduce((acc, child) => acc + getLeafCount(child), 0)
    }

    // 计算节点的具体 x, y 坐标
    const layoutNodes: FlatNode[] = []
    const layoutConnections: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

    const computeCoordinates = (
      node: FlatNode,
      yStart: number,
      yEnd: number,
      parentX?: number,
      parentY?: number
    ) => {
      const x = startX + node.depth * levelWidth
      const y = (yStart + yEnd) / 2

      node.x = x
      node.y = y
      node.parentX = parentX
      node.parentY = parentY

      layoutNodes.push(node)
      if (parentX !== undefined && parentY !== undefined) {
        layoutConnections.push({ x1: parentX, y1: parentY, x2: x, y2: y })
      }

      if (node.children.length > 0) {
        const totalLeaves = getLeafCount(node)
        let currentYStart = yStart
        node.children.forEach((child) => {
          const childLeaves = getLeafCount(child)
          const childYPercent = childLeaves / totalLeaves
          const childYEnd = currentYStart + (yEnd - yStart) * childYPercent
          computeCoordinates(child, currentYStart, childYEnd, x, y)
          currentYStart = childYEnd
        })
      }
    }

    computeCoordinates(flatRoot, 30, svgHeight - 30)

    return (
      <div
        className={`relative w-full h-[500px] border border-paper-aged rounded-sm bg-paper-cream overflow-hidden select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {/* 绘制水墨风格贝塞尔连线 */}
            {layoutConnections.map((conn, idx) => {
              const dx = conn.x2 - conn.x1
              const pathStr = `M ${conn.x1} ${conn.y1} C ${conn.x1 + dx / 2} ${conn.y1}, ${conn.x1 + dx / 2} ${conn.y2}, ${conn.x2} ${conn.y2}`
              return (
                <path
                  key={idx}
                  d={pathStr}
                  fill="none"
                  stroke="#333333"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                />
              )
            })}

            {/* 绘制大纲框体 */}
            {layoutNodes.map((node) => {
              const isLeaf = node.children.length === 0 && !node.isCollapsed
              const boxWidth = Math.max(100, node.topic.length * 12 + 20)
              const boxHeight = 30

              return (
                <g
                  key={node.id}
                  transform={`translate(${(node.x || 0) - 10}, ${(node.y || 0) - boxHeight / 2})`}
                >
                  <rect
                    width={boxWidth}
                    height={boxHeight}
                    rx="3"
                    fill="#ffffff"
                    stroke={node.depth === 0 ? '#111111' : '#888888'}
                    strokeWidth={node.depth === 0 ? '1.5' : '1'}
                    className="shadow-sm cursor-pointer hover:stroke-ink-black transition-all"
                    onClick={() => setSelectedNodeInfo({ label: node.topic, desc: `位于大纲第 ${node.depth + 1} 级的核心概念知识节点。`, nodeType: 'mindmap' })}
                  />
                  <text
                    x={10}
                    y={19}
                    fontSize="12"
                    fill="#111111"
                    fontFamily="sans-serif"
                    className="pointer-events-none select-none font-medium"
                  >
                    {node.topic}
                  </text>
                  {!isLeaf && (
                    <circle
                      cx={boxWidth}
                      cy={boxHeight / 2}
                      r="5"
                      fill={node.isCollapsed ? '#111111' : '#ffffff'}
                      stroke="#111111"
                      strokeWidth="1"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCollapse(node.id)
                      }}
                    />
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* 缩放/平移浮动控制按钮 */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10 bg-white/80 backdrop-blur-sm border border-paper-aged rounded-sm p-1 shadow-sm">
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="重置"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    )
  }

  // ============ 2. 知识图谱同心圆环排版 ============
  const renderConceptGraphSVG = () => {
    if (!conceptGraph) return null

    const svgWidth = 800
    const svgHeight = 500
    const centerX = svgWidth / 2
    const centerY = svgHeight / 2

    const { nodes = [], edges = [] } = conceptGraph

    // 1. 同心环排布节点坐标计算，第一圈核心，第二圈延伸
    const layoutNodes = nodes.map((node, index) => {
      let radius = 180
      let angle = (index * 2 * Math.PI) / Math.max(1, nodes.length - 1)
      let x = centerX + radius * Math.cos(angle)
      let y = centerY + radius * Math.sin(angle)

      // 第一个元素作为中心点，突出重点
      if (index === 0) {
        x = centerX
        y = centerY
      } else if (index % 2 === 0) {
        // 分流为内外两个圈层
        radius = 110
        angle = (index * 2 * Math.PI) / Math.max(1, nodes.length / 2)
        x = centerX + radius * Math.cos(angle)
        y = centerY + radius * Math.sin(angle)
      }

      return { ...node, x, y }
    })

    const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]))

    return (
      <div
        className={`relative w-full h-[500px] border border-paper-aged rounded-sm bg-paper-cream overflow-hidden select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg width="100%" height="100%">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#888888" />
            </marker>
          </defs>

          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {/* 绘制关系线 */}
            {edges.map((edge, idx) => {
              const sourceNode = nodeMap.get(edge.source)
              const targetNode = nodeMap.get(edge.target)
              if (!sourceNode || !targetNode) return null

              const mx = (sourceNode.x + targetNode.x) / 2
              const my = (sourceNode.y + targetNode.y) / 2

              return (
                <g key={idx}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="#888888"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    markerEnd="url(#arrow)"
                  />
                  {/* 连线中点的关系文字 */}
                  <g transform={`translate(${mx}, ${my})`}>
                    <rect
                      x={-25}
                      y={-10}
                      width={50}
                      height={16}
                      fill="#fcfaf2"
                      stroke="#dcd6c5"
                      strokeWidth="0.5"
                      rx="2"
                    />
                    <text
                      textAnchor="middle"
                      y={2}
                      fontSize="9"
                      fill="#555555"
                      fontFamily="sans-serif"
                      className="pointer-events-none select-none"
                    >
                      {edge.label}
                    </text>
                  </g>
                </g>
              )
            })}

            {/* 绘制实体泡泡节点 */}
            {layoutNodes.map((node, idx) => {
              // 水墨黑白色调深度区分
              const isCenter = idx === 0
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedNodeInfo({ label: node.label, desc: node.desc, nodeType: 'concept' })}
                >
                  <circle
                    r={isCenter ? '24' : '18'}
                    fill={isCenter ? '#111111' : '#ffffff'}
                    stroke="#111111"
                    strokeWidth="1.5"
                    className="hover:scale-105 transition-transform shadow-md"
                  />
                  <text
                    textAnchor="middle"
                    y={4}
                    fontSize={isCenter ? '10' : '9'}
                    fill={isCenter ? '#ffffff' : '#111111'}
                    fontFamily="sans-serif"
                    className="pointer-events-none select-none font-medium"
                  >
                    {node.label.slice(0, 4)}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* 缩放/平移浮动控制按钮 */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10 bg-white/80 backdrop-blur-sm border border-paper-aged rounded-sm p-1 shadow-sm">
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1 hover:bg-paper-aged rounded-sm text-ink-black transition-colors"
            title="重置"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    )
  }

  // ============ 3. 页面返回逻辑 ============
  const currentMapData = mapType === 'mindmap' ? mindmap : conceptGraph

  if (mapLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">{t('learn.map.generating')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-paper-cream overflow-hidden">
      {/* 顶部标签切换与生成 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-paper-aged bg-paper-white">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMapType('mindmap')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-sm transition-colors ${
              mapType === 'mindmap'
                ? 'bg-ink-black text-paper-white'
                : 'text-ink-medium hover:text-ink-black hover:bg-paper-aged'
            }`}
          >
            <GitMerge size={12} />
            {t('learn.map.tabMindmap')}
          </button>
          <button
            onClick={() => setMapType('concept_graph')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-sm transition-colors ${
              mapType === 'concept_graph'
                ? 'bg-ink-black text-paper-white'
                : 'text-ink-medium hover:text-ink-black hover:bg-paper-aged'
            }`}
          >
            <Network size={12} />
            {t('learn.map.tabGraph')}
          </button>
        </div>
        <button
          onClick={handleGenerateMap}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     bg-ink-black text-paper-white rounded-sm
                     hover:bg-ink-medium transition-colors"
        >
          <Sparkles size={12} />
          {t('learn.map.generateBtn')}
        </button>
      </div>

      {/* 图谱画板与详情联动区 */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 gap-4">
        {/* 图谱区 */}
        <div className="flex-1 min-w-0">
          {currentMapData ? (
            mapType === 'mindmap' ? renderMindmapSVG() : renderConceptGraphSVG()
          ) : (
            <div className="flex flex-col items-center justify-center h-full border border-paper-aged border-dashed rounded-sm text-ink-faint p-4">
              <Network size={36} className="mb-2 opacity-30" />
              <p className="text-sm mb-4">{t('learn.map.empty')}</p>
              <button
                onClick={handleGenerateMap}
                className="px-4 py-2 text-xs font-medium bg-ink-black text-paper-white rounded-sm hover:bg-ink-medium transition-colors"
              >
                {t('learn.map.generateBtn')}
              </button>
            </div>
          )}
        </div>

        {/* 右侧节点释义详情看板 */}
        <div className="w-full md:w-60 shrink-0 border border-paper-aged rounded-sm bg-paper-white p-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-ink-black flex items-center gap-1 border-b border-paper-aged pb-2">
              <Info size={12} />
              {t('learn.map.infoTitle')}
            </h4>
            {selectedNodeInfo ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink-black">{selectedNodeInfo.label}</p>
                  <p className="text-xs text-ink-medium leading-relaxed">{selectedNodeInfo.desc}</p>
                </div>
                <div className="space-y-1.5 pt-2 border-t border-paper-aged">
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
          <div className="text-[10px] text-ink-faint border-t border-paper-aged pt-2 mt-4">
            {t('learn.map.tip')}
          </div>
        </div>
      </div>
    </div>
  )
}
