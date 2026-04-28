"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export interface SeymourViewContext {
  /** Short label of what the user is currently looking at, e.g. "Findings — Critical (12)". */
  label: string
  /** Optional structured payload that gets injected into the prompt. */
  details?: Record<string, unknown>
}

interface SeymourState {
  open: boolean
  pendingPrompt: string | null
  context: SeymourViewContext | null
  openWith: (prompt?: string) => void
  close: () => void
  toggle: () => void
  consumePendingPrompt: () => string | null
  setContext: (ctx: SeymourViewContext | null) => void
}

const SeymourContext = createContext<SeymourState>({
  open: false,
  pendingPrompt: null,
  context: null,
  openWith: () => {},
  close: () => {},
  toggle: () => {},
  consumePendingPrompt: () => null,
  setContext: () => {},
})

function getInitialOpen(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem("waste:seymourOpen") === "1"
  } catch {
    return false
  }
}

function persistOpen(open: boolean) {
  try {
    window.localStorage.setItem("waste:seymourOpen", open ? "1" : "0")
  } catch {
    /* ignore */
  }
}

export function WasteSeymourProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<boolean>(getInitialOpen)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [context, setContext] = useState<SeymourViewContext | null>(null)

  const openWith = useCallback((prompt?: string) => {
    if (prompt && prompt.trim()) setPendingPrompt(prompt.trim())
    setOpen(true)
    persistOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    persistOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setOpen((prev) => {
      persistOpen(!prev)
      return !prev
    })
  }, [])

  const consumePendingPrompt = useCallback(() => {
    const p = pendingPrompt
    setPendingPrompt(null)
    return p
  }, [pendingPrompt])

  const value = useMemo(
    () => ({
      open,
      pendingPrompt,
      context,
      openWith,
      close,
      toggle,
      consumePendingPrompt,
      setContext,
    }),
    [open, pendingPrompt, context, openWith, close, toggle, consumePendingPrompt],
  )

  return (
    <SeymourContext.Provider value={value}>{children}</SeymourContext.Provider>
  )
}

export function useWasteSeymour() {
  return useContext(SeymourContext)
}
