"use client"

import { WasteShell } from "./waste-shell"
import { ForensicsShell } from "./forensics-shell"
import { WasteExport } from "./waste-export"
import {
  FileSpreadsheet,
  FileText,
  FileJson,
} from "lucide-react"

const EXPORT_CATEGORIES = [
  { key: "all", label: "All Categories", description: "Complete findings export across all detector categories" },
  { key: "payroll", label: "Payroll & Personnel", description: "Overtime, compensation anomalies, and personnel integrity" },
  { key: "contracts", label: "Contracts & Procurement", description: "Vendor, procurement, and contract findings" },
  { key: "infrastructure", label: "Infrastructure & Services", description: "311 clusters and infrastructure patterns" },
  { key: "influence", label: "Influence & Pay-to-Play", description: "Campaign contributions and lobbying patterns" },
  { key: "integrity", label: "Personnel Integrity", description: "Conflict of interest and ethics findings" },
  { key: "confirmed", label: "Confirmed Cases", description: "Previously confirmed fraud, waste, and abuse" },
]

export function ForensicsExportsPage() {
  return (
    <WasteShell
      title="Findings"
      description="Browse and investigate detected anomalies"
    >
      <ForensicsShell title="Evidence Export">
        <p className="text-sm text-gray-500 mb-6">
          Export findings, auditor reports, and evidence packages for IG
          referrals, audit reports, and legal proceedings.
        </p>

        <div className="space-y-4">
          {EXPORT_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="bg-white rounded-lg border border-gray-200 p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {cat.label}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {cat.description}
                </p>
              </div>
              <WasteExport category={cat.key} />
            </div>
          ))}
        </div>

        <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Export Formats
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700">Excel</p>
                <p className="text-xs text-gray-500">
                  Auditor report with summary, findings, and methodology
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700">CSV</p>
                <p className="text-xs text-gray-500">
                  Raw findings data for custom analysis
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileJson className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700">JSON</p>
                <p className="text-xs text-gray-500">
                  Structured data for programmatic consumption
                </p>
              </div>
            </div>
          </div>
        </div>
      </ForensicsShell>
    </WasteShell>
  )
}
