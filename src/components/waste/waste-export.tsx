"use client"

import { useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { Button } from "@/components/ui/button"
import { Download, FileSpreadsheet } from "lucide-react"
import { exportWasteFindings, exportAuditorReport } from "@/lib/apiClient"

interface WasteExportProps {
  category: string
}

export function WasteExport({ category }: WasteExportProps) {
  const { getAccessTokenSilently } = useAuth0()
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async (format: "csv" | "json" | "xlsx") => {
    try {
      setExporting(format)
      setExportError(null)
      const token = await getAccessTokenSilently()

      if (format === "xlsx") {
        const blob = await exportAuditorReport(token, category)
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `auditor_report_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }

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
      const message =
        err instanceof Error ? err.message : "Export failed. Please try again."
      setExportError(message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {exportError && (
        <span className="w-full text-xs text-red-600 mb-1">
          {exportError}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("xlsx")}
        disabled={exporting !== null}
        className="text-xs"
      >
        <FileSpreadsheet className="w-3 h-3 mr-1" />
        {exporting === "xlsx" ? "..." : "Excel"}
      </Button>
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
