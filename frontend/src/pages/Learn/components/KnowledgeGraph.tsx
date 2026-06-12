import { useCallback, useState, useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { learnService } from '../../../services/learnService'
import ReactECharts from 'echarts-for-react'

interface KnowledgeGraphProps {
  onNodeClick?: (nodeName: string) => void
}

export default function KnowledgeGraph({ onNodeClick }: KnowledgeGraphProps) {
  const [loading, setLoading] = useState(false)
  const [graphData, setGraphData] = useState<any>(null)

  const fetchGraph = useCallback(async () => {
    setLoading(true)
    try {
      const data = await learnService.getKnowledgeGraph()
      setGraphData(data)
    } catch (err) {
      console.error("Failed to fetch knowledge graph:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  const getOption = () => {
    if (!graphData || !graphData.nodes || !graphData.links) return {}
    
    const categories = Array.from(new Set(graphData.nodes.map((n: any) => n.category || 'default'))) as string[]
    const categoryMap = categories.reduce((acc: any, curr: string, idx: number) => {
      acc[curr] = idx
      return acc
    }, {})

    return {
      tooltip: {},
      legend: [{
        data: categories
      }],
      series: [{
        type: 'graph',
        layout: 'force',
        data: graphData.nodes.map((node: any) => ({
          ...node,
          id: node.id,
          name: node.name,
          symbolSize: (node.val || 1) * 15,
          category: categoryMap[node.category || 'default'],
        })),
        links: graphData.links.map((link: any) => ({
          source: link.source,
          target: link.target,
          label: {
            show: true,
            formatter: link.relation,
            fontSize: 10
          }
        })),
        categories: categories.map(c => ({ name: c })),
        roam: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}'
        },
        lineStyle: {
          color: 'source',
          curveness: 0.3
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 10
          }
        }
      }]
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-ink-faint" />
        <span className="ml-2 text-ink-faint">正在构建知识图谱...</span>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={fetchGraph}
          className="p-2 bg-paper-white border border-paper-aged rounded-md hover:bg-paper-aged"
          title="刷新图谱"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {graphData ? (
        <ReactECharts
          option={getOption()}
          style={{ height: '100%', width: '100%' }}
          onEvents={{
            click: (params: any) => {
              if (params.dataType === 'node' && onNodeClick) {
                onNodeClick(params.name)
              }
            }
          }}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-ink-faint">
          暂无知识图谱数据，请先上传文档
        </div>
      )}
    </div>
  )
}
