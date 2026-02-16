"use client"

import { useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { exportWasteFindings } from "@/lib/apiClient"

interface WasteExportProps {
  category: string
}

export function WasteExport({ category }: WasteExportProps) {
  const { getAccessTokenSilently } = useAuth0()
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (format: "csv" | "json") => {
    try {
      setExporting(format)
      const token = await getAccessTokenSilently()
      const blob = await exportWasteFindings(token, category, format)

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `waste_${category}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Export failed:", err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("csv")}
        disabled={exporting !== null}
        className="text-xs"
      >
        <Download className="w-3 h-3 mr-1" />
        {exporting === "csv" ? "..." : "CSV"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("json")}
        disabled={exporting !== null}
        className="text-xs"
      >
        <Download className="w-3 h-3 mr-1" />
        {exporting === "json" ? "..." : "JSON"}
      </Button>
    </div>
  )
}
