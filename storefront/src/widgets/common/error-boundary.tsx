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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-cream px-6 text-center" data-testid="error-boundary">
        <p className="eyebrow">Lupus Books</p>
        <h1 className="font-display text-3xl font-semibold text-brand-forest">Trang sách này đang bị gián đoạn</h1>
        <p className="max-w-lg text-sm text-brand-ink/55">{this.state.error.message}</p>
        <button className="rounded-full bg-brand-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-forest-dark" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </div>
    )
  }
}
