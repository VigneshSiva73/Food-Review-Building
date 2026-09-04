import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
}

/**
 * Catches render/mount failures in the 3D subtree (plan §33) so a WebGL or
 * three.js problem degrades to a readable message instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[scene] render failed:', error, info.componentStack)
    this.props.onError?.(error)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
