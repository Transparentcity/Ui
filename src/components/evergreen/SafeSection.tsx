"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback UI; defaults to rendering nothing */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that silently catches rendering errors in evergreen page sections.
 * Instead of crashing the whole page, the broken section simply disappears.
 */
export default class SafeSection extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[SafeSection] Section removed due to error:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (this.props.fallback ?? null) as ReactNode;
    }
    return this.props.children;
  }
}
