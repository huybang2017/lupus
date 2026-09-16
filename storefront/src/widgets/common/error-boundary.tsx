import React from "react"

type Props = { children: React.ReactNode }

/** Last-resort boundary so a render error shows a message instead of a blank page. */
export default class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]" data-testid="error-boundary">
        <h1 className="text-2xl-semi text-ui-fg-base">Something went wrong</h1>
        <p className="text-small-regular text-ui-fg-base">{this.state.error.message}</p>
        <button className="text-ui-fg-interactive" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    )
  }
}
