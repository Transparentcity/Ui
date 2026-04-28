"use client"

import { Sparkles, ArrowRight } from "lucide-react"
import { useState } from "react"
import { useWasteSeymour, type SeymourViewContext } from "./waste-seymour-context"

interface WasteSeymourAskBarProps {
  /** What's on screen right now. The rail will surface this above the chat. */
  context?: SeymourViewContext
  placeholder?: string
  className?: string
}

/**
 * Inline "Ask Seymour about this view…" input. Submitting opens the
 * persistent right-rail with the question pre-filled and answered.
 */
export function WasteSeymourAskBar({
  context,
  placeholder = "Ask Seymour about this view…",
  className,
}: WasteSeymourAskBarProps) {
  const { openWith, setContext } = useWasteSeymour()
  const [value, setValue] = useState("")

  function submit() {
    if (context) setContext(context)
    openWith(value)
    setValue("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onFocus={() => {
        if (context) setContext(context)
      }}
      className={
        "flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 focus-within:border-purple-400 " +
        (className ?? "")
      }
    >
      <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-gray-400"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="text-purple-600 hover:text-purple-800 disabled:text-gray-300 p-1"
        aria-label="Ask Seymour"
      >
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  )
}
