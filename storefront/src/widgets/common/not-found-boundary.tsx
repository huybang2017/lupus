import { NotFoundError } from "@/shared/navigation/router"
import React from "react"

type Props = { fallback: React.ReactNode; children: React.ReactNode }

/** Catches notFound() thrown while rendering and shows the 404 page instead; other errors propagate. */
export default class NotFoundBoundary extends React.Component<Props, { notFound: boolean }> {
  state = { notFound: false }

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof NotFoundError) {
      return { notFound: true }
    }
    throw error
  }

  render() {
    return this.state.notFound ? this.props.fallback : this.props.children
  }
}
