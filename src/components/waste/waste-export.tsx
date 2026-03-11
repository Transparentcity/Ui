"use client"

import { useState } from "react"
import { useAuth0 } from "@auth0/auth0-react"
import { Button } from "@/components/ui/button"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { exportWasteFindings, exportAuditorReport } from "@/lib/apiClient"
import { toast } from "sonner"

interface WasteExportProps {
  category: string
  cityId?: number
}

export function WasteExport({ category, cityId }: WasteExportProps) {
  const { getAccessTokenSilently } = useAuth0()
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async (format: "csv" | "json" | "xlsx") => {
    try {
      setExporting(format)
      setExportError(null)
      const token = await getAccessTokenSilently()

      if (format === "xlsx") {
        const blob = await exportAuditorReport(token, category, cityId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `auditor_report_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Excel export downloaded")
        return
      }

      const blob = await exportWasteFindings(token, category, format, cityId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `waste_${category}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} export downloaded`)
    } catch (err) {
      console.error("Export failed:", err)
      const message =
        err instanceof Error ? err.message : "Export failed. Please try again."
      setExportError(message)
      toast.error(message)
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
        {exporting === "xlsx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3 h-3 mr-1" />}
        {exporting === "xlsx" ? "" : "Excel"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("csv")}
        disabled={exporting !== null}
        className="text-xs"
      >
        {exporting === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
        {exporting === "csv" ? "" : "CSV"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleExport("json")}
        disabled={exporting !== null}
        className="text-xs"
      >
        {exporting === "json" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
        {exporting === "json" ? "" : "JSON"}
      </Button>
    </div>
  )
}
