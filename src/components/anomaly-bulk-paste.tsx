"use client"

import React from "react"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClipboardPaste, CheckCircle2, AlertCircle } from "lucide-react"
import { bulkCreateAnomalies } from "@/app/actions/anomalies"

interface ParsedAnomaly {
  title: string
  district: string | null
  severity: "low" | "medium" | "high" | "critical"
  is_citywide: boolean
}

interface AnomalyBulkPasteProps {
  children: React.ReactNode
}

export function AnomalyBulkPaste({ children }: AnomalyBulkPasteProps) {
  const [open, setOpen] = useState(false)
  const [rawText, setRawText] = useState("")
  const [defaultSeverity, setDefaultSeverity] = useState<"low" | "medium" | "high" | "critical">("medium")
  const [parsed, setParsed] = useState<ParsedAnomaly[]>([])
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null)

  // Parse pasted text into anomalies
  // Handles format like:
  // District 11 (Excelsior/Outer Mission)
  // Drug Violations: +116% (December 2025)
  // 9 incidents vs. 4 average (last 6 months)
  // Drug crime more than doubled in the Excelsior
  const parseText = (text: string) => {
    const lines = text.split("\n").map(line => line.trim())
    const anomalies: ParsedAnomaly[] = []
    
    let currentDistrict: string | null = null
    let currentTitle: string | null = null
    let currentDescription: string[] = []
    
    const saveCurrentAnomaly = () => {
      if (currentTitle) {
        // Combine title + description
        const fullDescription = currentDescription.length > 0 
          ? `${currentTitle}\n${currentDescription.join("\n")}`
          : currentTitle
        
        // Detect severity from percentage changes
        let severity = defaultSeverity
        const percentMatch = fullDescription.match(/[+-](\d+)%/)
        if (percentMatch) {
          const percent = parseInt(percentMatch[1])
          if (percent >= 100) severity = "critical"
          else if (percent >= 50) severity = "high"
          else if (percent >= 20) severity = "medium"
          else severity = "low"
        }
        
        // Check for explicit severity markers
        if (/\[critical\]|\(critical\)/i.test(fullDescription)) severity = "critical"
        else if (/\[high\]|\(high\)/i.test(fullDescription)) severity = "high"
        else if (/\[low\]|\(low\)/i.test(fullDescription)) severity = "low"
        
        // Check for citywide
        const isCitywide = /citywide/i.test(fullDescription)
        
        anomalies.push({
          title: fullDescription.replace(/\[critical\]|\[high\]|\[low\]|\(critical\)|\(high\)|\(low\)/gi, "").trim(),
          district: isCitywide ? null : currentDistrict,
          severity,
          is_citywide: isCitywide,
        })
      }
      currentTitle = null
      currentDescription = []
    }
    
    for (const line of lines) {
      if (!line) continue
      
      // Check if this is a district header line
      // Matches: "District 11 (Excelsior/Outer Mission)" or "D5" or "District 3:"
      const districtHeaderMatch = line.match(/^(?:District\s*)?(\d+)(?:\s*\(.*?\))?:?\s*$/i)
      if (districtHeaderMatch) {
        saveCurrentAnomaly()
        currentDistrict = `D${districtHeaderMatch[1]}`
        continue
      }
      
      // Check if line starts with emoji or bullet - that's a new anomaly title
      const startsWithEmoji = /^[\u{1F300}-\u{1F9FF}]|^[•\-\*]/u.test(line)
      const hasStatIndicator = /[+-]?\d+%|\d+\s*(incidents?|cases?|calls?|vs\.?)/i.test(line)
      
      if (startsWithEmoji || (hasStatIndicator && !currentTitle)) {
        // Save previous anomaly if exists
        saveCurrentAnomaly()
        currentTitle = line
      } else if (currentTitle) {
        // This is a continuation/description line
        currentDescription.push(line)
      } else {
        // No current anomaly, treat as new title
        currentTitle = line
      }
    }
    
    // Don't forget the last one
    saveCurrentAnomaly()

    setParsed(anomalies)
  }

  const handleTextChange = (text: string) => {
    setRawText(text)
    parseText(text)
    setResult(null)
  }

  const handleImport = () => {
    startTransition(async () => {
      try {
        await bulkCreateAnomalies(parsed)
        // If we reach here, it succeeded (though current impl throws READ_ONLY error)
        setResult({ success: parsed.length, failed: 0 })
        setTimeout(() => {
          setOpen(false)
          setRawText("")
          setParsed([])
          setResult(null)
        }, 1500)
      } catch (error) {
        console.error("Import failed:", error)
        // Anomaly creation is read-only - show error message
        setResult({ success: 0, failed: parsed.length })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" />
            Bulk Paste Anomalies
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Paste your anomalies (one per line)</Label>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Default severity:</Label>
                <Select value={defaultSeverity} onValueChange={(v: any) => {
                  setDefaultSeverity(v)
                  parseText(rawText)
                }}>
                  <SelectTrigger className="w-28 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Textarea
              placeholder={`Paste anomalies here. Example format:

District 11 (Excelsior/Outer Mission)
Drug Violations: +116% (December 2025)
9 incidents vs. 4 average (last 6 months)
Drug crime more than doubled in the Excelsior

District 5 (Haight)
Property Crime: +45% (January 2026)
23 incidents reported

Citywide
911 Response Times: +18%
Average response now 8.2 minutes`}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              District headers apply to following items. Severity auto-detected from % changes (100%+ = critical, 50%+ = high)
            </p>
          </div>

          {parsed.length > 0 && (
            <div className="flex-1 min-h-0 border rounded-lg overflow-auto">
              <div className="p-3 border-b bg-muted/50 sticky top-0">
                <span className="font-medium">{parsed.length} anomalies detected</span>
              </div>
              <div className="divide-y">
                {parsed.map((anomaly, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{anomaly.title}</p>
                    </div>
                    {anomaly.district && (
                      <Badge variant="secondary" className="shrink-0">
                        {anomaly.district}
                      </Badge>
                    )}
                    {anomaly.is_citywide && (
                      <Badge variant="secondary" className="shrink-0 bg-blue-100 text-blue-800">
                        Citywide
                      </Badge>
                    )}
                    <Badge 
                      variant="outline" 
                      className={
                        anomaly.severity === "critical" ? "border-red-500 text-red-600" :
                        anomaly.severity === "high" ? "border-orange-500 text-orange-600" :
                        anomaly.severity === "low" ? "border-gray-400 text-gray-500" :
                        "border-yellow-500 text-yellow-600"
                      }
                    >
                      {anomaly.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              result.failed === 0 ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800"
            }`}>
              {result.failed === 0 ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>
                Imported {result.success} anomalies
                {result.failed > 0 && `, ${result.failed} failed`}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={parsed.length === 0 || isPending}
          >
            {isPending ? "Importing..." : `Import ${parsed.length} Anomalies`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
