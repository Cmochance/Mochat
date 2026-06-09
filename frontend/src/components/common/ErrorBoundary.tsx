import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper-white p-8">
          <div className="ink-card max-w-md p-8 text-center">
            <h2 className="mb-4 text-xl font-bold text-ink-black">页面出错了</h2>
            <p className="mb-6 text-ink-medium">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              className="rounded bg-ink-black px-4 py-2 text-paper-white transition-colors hover:bg-ink-medium"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
