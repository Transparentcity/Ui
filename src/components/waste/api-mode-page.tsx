"use client"

import { useState } from "react"
import Link from "next/link"
import { WasteShell } from "./waste-shell"
import { TCScoreBadge } from "./tc-score-badge"
import { cn } from "@/lib/utils"
import {
  Code2,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Clock,
  AlertTriangle,
  XOctagon,
} from "lucide-react"

// ── Event Type Definitions ──────────────────────────────────────────────────

type EventType = {
  id: string
  label: string
  payload: Record<string, unknown>
  response: {
    tc_score: number
    severity: string
    top_reasons: string[]
    action: string
    detectors_used: string[]
  }
  detectors: { id: string; name: string }[]
  suite: string
}

const EVENT_TYPES: EventType[] = [
  {
    id: "overtime_approval",
    label: "Overtime Approval",
    payload: {
      event_type: "overtime_approval",
      employee_id: "E-4281",
      department: "Public Works",
      overtime_hours: 847,
      pay_period: "2025-Q4",
      approver: "mgonzalez",
      base_salary: 92400,
    },
    response: {
      tc_score: 84.2,
      severity: "critical",
      top_reasons: [
        "Overtime 3.4x departmental average",
        "Same approver for 92% of OT requests",
        "Benford distribution anomaly on hours (p=0.02)",
      ],
      action: "hold_for_senior_review",
      detectors_used: ["D1", "D2", "D4", "D6", "D7"],
    },
    detectors: [
      { id: "D1", name: "Duplicate Detection" },
      { id: "D2", name: "Temporal Patterns" },
      { id: "D4", name: "Benford Analysis" },
      { id: "D6", name: "Peer Comparison" },
      { id: "D7", name: "Ghost Employee" },
    ],
    suite: "Payroll",
  },
  {
    id: "invoice_submitted",
    label: "Invoice Submitted",
    payload: {
      event_type: "invoice_submit",
      vendor_id: "V-2847",
      vendor_name: "Metro Professional Services",
      amount: 47200,
      department: "Public Works",
      approver: "jsmith",
      contract_id: "CT-2024-0891",
      invoice_date: "2025-11-15",
    },
    response: {
      tc_score: 78.4,
      severity: "high",
      top_reasons: [
        "Vendor address matches employee home address",
        "Invoice amount exceeds 3x historical average",
        "Vendor created < 90 days ago",
      ],
      action: "route_to_queue",
      detectors_used: ["D1", "D2", "D4", "D5", "D6", "D8", "D9", "D10", "D12", "D19"],
    },
    detectors: [
      { id: "D1", name: "Duplicate Detection" },
      { id: "D2", name: "Temporal Patterns" },
      { id: "D4", name: "Benford Analysis" },
      { id: "D5", name: "Address Matching" },
      { id: "D6", name: "Peer Comparison" },
      { id: "D8", name: "Split PO" },
      { id: "D9", name: "Ghost Vendor" },
      { id: "D10", name: "Contract Drift" },
      { id: "D12", name: "Concentration" },
      { id: "D19", name: "Pattern Analysis" },
    ],
    suite: "Vendor",
  },
  {
    id: "vendor_creation",
    label: "Vendor Creation",
    payload: {
      event_type: "vendor_creation",
      vendor_name: "Acme Consulting Group LLC",
      tax_id: "XX-XXX4821",
      address: "1847 Market St, Anytown, US",
      contact_email: "billing@acme-cg.com",
      requested_by: "procurement_dept",
      category: "Professional Services",
    },
    response: {
      tc_score: 62.1,
      severity: "high",
      top_reasons: [
        "Address within 0.2mi of city employee residence",
        "Similar name to previously debarred vendor",
        "Tax ID pattern matches known shell company format",
      ],
      action: "route_to_queue",
      detectors_used: ["D5", "D9", "D19"],
    },
    detectors: [
      { id: "D5", name: "Address Matching" },
      { id: "D9", name: "Ghost Vendor" },
      { id: "D19", name: "Pattern Analysis" },
    ],
    suite: "Vendor (subset)",
  },
  {
    id: "contract_amendment",
    label: "Contract Amendment",
    payload: {
      event_type: "contract_amendment",
      contract_id: "CT-2023-0447",
      vendor_name: "Metro Infrastructure Inc",
      original_amount: 250000,
      amendment_amount: 187500,
      new_total: 437500,
      amendment_number: 3,
      department: "DPW Engineering",
      justification: "Scope expansion for Phase 2",
    },
    response: {
      tc_score: 71.8,
      severity: "high",
      top_reasons: [
        "75% increase exceeds amendment threshold (50%)",
        "3rd amendment in 12 months (avg: 0.8)",
        "Vendor holds 34% of department spend",
      ],
      action: "route_to_queue",
      detectors_used: ["D10", "D8", "D12"],
    },
    detectors: [
      { id: "D10", name: "Contract Drift" },
      { id: "D8", name: "Split PO" },
      { id: "D12", name: "Concentration" },
    ],
    suite: "Vendor (subset)",
  },
  {
    id: "grant_disbursement",
    label: "Grant Disbursement",
    payload: {
      event_type: "grant_disbursement",
      grantee: "Community Health Alliance",
      grant_id: "GR-2024-0192",
      amount: 125000,
      program: "Behavioral Health Services",
      fiscal_year: 2025,
      disbursement_number: 3,
      total_awarded: 500000,
    },
    response: {
      tc_score: 45.3,
      severity: "medium",
      top_reasons: [
        "Disbursement schedule ahead of milestone delivery",
        "Grantee address matches another grantee",
        "Board overlap with city advisory committee",
      ],
      action: "approve_with_logging",
      detectors_used: ["D1", "D5", "D9", "D19", "NP1", "NP2", "NP3", "NP4"],
    },
    detectors: [
      { id: "D1", name: "Duplicate Detection" },
      { id: "D5", name: "Address Matching" },
      { id: "D9", name: "Ghost Vendor" },
      { id: "D19", name: "Pattern Analysis" },
      { id: "NP1", name: "Nonprofit Governance" },
      { id: "NP2", name: "Grant Compliance" },
      { id: "NP3", name: "Board Overlap" },
      { id: "NP4", name: "Spending Patterns" },
    ],
    suite: "Vendor + Nonprofit",
  },
  {
    id: "po_approval",
    label: "PO Approval",
    payload: {
      event_type: "po_approval",
      po_number: "PO-2025-8847",
      vendor_name: "Office Solutions Direct",
      amount: 24800,
      department: "IT Services",
      requestor: "tanderson",
      approval_limit: 25000,
      category: "Office Supplies",
    },
    response: {
      tc_score: 38.7,
      severity: "medium",
      top_reasons: [
        "Amount 99.2% of approval limit ($25K)",
        "4th PO to same vendor this month",
        "Benford first-digit anomaly on amount",
      ],
      action: "approve_with_logging",
      detectors_used: ["D1", "D4", "D8", "D12"],
    },
    detectors: [
      { id: "D1", name: "Duplicate Detection" },
      { id: "D4", name: "Benford Analysis" },
      { id: "D8", name: "Split PO" },
      { id: "D12", name: "Concentration" },
    ],
    suite: "Vendor (subset)",
  },
]

// ── Detector Mapping Table ──────────────────────────────────────────────────

const DETECTOR_MAPPING = [
  {
    event: "Overtime Approval",
    detectors: "D1, D2, D4, D6, D7",
    suite: "Payroll",
  },
  {
    event: "Invoice Submitted",
    detectors: "D1, D2, D4, D5, D6, D8, D9, D10, D12, D19",
    suite: "Vendor",
  },
  {
    event: "Vendor Creation",
    detectors: "D5, D9, D19",
    suite: "Vendor (subset)",
  },
  {
    event: "Contract Amendment",
    detectors: "D8, D10, D12",
    suite: "Vendor (subset)",
  },
  {
    event: "Grant Disbursement",
    detectors: "D1, D5, D9, D19, NP1-NP4",
    suite: "Vendor + Nonprofit",
  },
  {
    event: "PO Approval",
    detectors: "D1, D4, D8, D12",
    suite: "Vendor (subset)",
  },
]

// ── Decision Logic ──────────────────────────────────────────────────────────

const DECISION_LOGIC = [
  {
    range: "0 – 30",
    action: "Auto-approve",
    color: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
  },
  {
    range: "31 – 60",
    action: "Approve with logging",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
  },
  {
    range: "61 – 80",
    action: "Route to review queue",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    icon: AlertTriangle,
  },
  {
    range: "81 – 100",
    action: "Hold for senior review",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: XOctagon,
  },
]

// ── JSON Syntax Highlighter ─────────────────────────────────────────────────

function JsonBlock({
  data,
  highlight,
}: {
  data: Record<string, unknown>
  highlight?: string[]
}) {
  const lines = JSON.stringify(data, null, 2).split("\n")
  return (
    <pre className="text-xs leading-relaxed overflow-x-auto">
      {lines.map((line, i) => {
        const isHighlighted = highlight?.some((h) => line.includes(`"${h}"`))
        return (
          <div
            key={i}
            className={cn(
              "px-1 -mx-1 rounded",
              isHighlighted && "bg-yellow-100/60"
            )}
          >
            {line}
          </div>
        )
      })}
    </pre>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ApiModePage() {
  const [selectedEvent, setSelectedEvent] = useState<string>(
    EVENT_TYPES[0].id
  )
  const event = EVENT_TYPES.find((e) => e.id === selectedEvent) ?? EVENT_TYPES[0]

  return (
    <WasteShell
      title="Guardrails API"
      description="Transparent City's integration layer for city systems"
    >
      {/* How It Works — Flow Diagram */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          How It Works
        </h2>
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0">
          {/* City Systems */}
          <div className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-lg bg-blue-50 border border-blue-200 min-w-[140px]">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              City System
            </span>
            <div className="text-[11px] text-blue-600 space-y-0.5 text-center">
              <p>Payroll</p>
              <p>Procurement</p>
              <p>Grants</p>
              <p>Contracts</p>
            </div>
          </div>

          {/* Arrow: event */}
          <div className="flex flex-col items-center gap-0.5 px-3">
            <div className="hidden md:block w-16 h-px bg-gray-300 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-gray-400 border-y-[4px] border-y-transparent" />
            </div>
            <span className="text-[10px] text-gray-500 font-medium">
              event
            </span>
          </div>

          {/* TC Guardrails */}
          <div className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-lg bg-purple-50 border border-purple-200 min-w-[180px]">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
              TC Guardrails API
            </span>
            <div className="text-[11px] text-purple-600 space-y-0.5 text-center">
              <p>Map to detectors</p>
              <p>Compute score</p>
              <p>Return reasons</p>
              <p>Route to queue</p>
            </div>
          </div>

          {/* Arrow: score */}
          <div className="flex flex-col items-center gap-0.5 px-3">
            <div className="hidden md:block w-16 h-px bg-gray-300 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-l-gray-400 border-y-[4px] border-y-transparent" />
            </div>
            <span className="text-[10px] text-gray-500 font-medium">
              score + action
            </span>
          </div>

          {/* Decision */}
          <div className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-lg bg-emerald-50 border border-emerald-200 min-w-[140px]">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Decision
            </span>
            <div className="text-[11px] text-emerald-600 space-y-0.5 text-center">
              <p>Auto-approve</p>
              <p>Log & approve</p>
              <p>Route to queue</p>
              <p>Hold for review</p>
            </div>
          </div>
        </div>
      </div>

      {/* Event Type Selector */}
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Sample Event Types
      </h2>
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {EVENT_TYPES.map((evt) => (
          <button
            key={evt.id}
            type="button"
            onClick={() => setSelectedEvent(evt.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
              selectedEvent === evt.id
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700"
            )}
          >
            {evt.label}
          </button>
        ))}
      </div>

      {/* Event Simulator Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Event Payload */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Event Payload
            </span>
            <span className="text-[10px] text-gray-500">
              POST /api/guardrails/score
            </span>
          </div>
          <div className="p-4 font-mono text-gray-700 bg-gray-900/[0.02]">
            <JsonBlock data={event.payload} />
          </div>
        </div>

        {/* Score Response */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Score Response
            </span>
            <span className="text-[10px] text-gray-500">200 OK</span>
          </div>
          <div className="p-4">
            {/* Score hero */}
            <div className="flex items-center gap-3 mb-4">
              <TCScoreBadge score={event.response.tc_score} size="xl" showLabel />
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {event.response.action.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </p>
                <p className="text-xs text-gray-500">
                  {event.response.detectors_used.length} detectors evaluated
                </p>
              </div>
            </div>

            {/* Reasons */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Top Reasons
              </p>
              <div className="space-y-1.5">
                {event.response.top_reasons.map((reason, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-gray-700"
                  >
                    <span className="text-red-400 mt-0.5 shrink-0">&#x25cf;</span>
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            {/* JSON response */}
            <details className="group">
              <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-600 list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show raw JSON</span>
                <span className="hidden group-open:inline">Hide raw JSON</span>
              </summary>
              <div className="mt-2 font-mono text-gray-700 bg-gray-900/[0.02] rounded p-3">
                <JsonBlock
                  data={event.response}
                  highlight={["tc_score", "action"]}
                />
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* Detector Mapping + Decision Logic side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Detector Mapping Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">
              Detector Mapping
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Which detectors fire for each event type
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">
                    Event Type
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">
                    Detectors
                  </th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">
                    Suite
                  </th>
                </tr>
              </thead>
              <tbody>
                {DETECTOR_MAPPING.map((row) => (
                  <tr
                    key={row.event}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="py-2.5 px-4 text-gray-800 font-medium whitespace-nowrap">
                      {row.event}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-600 font-mono">
                      {row.detectors}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">
                      {row.suite}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Decision Logic Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">
              Decision Logic
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Score ranges and recommended actions
            </p>
          </div>
          <div className="p-4 space-y-2">
            {DECISION_LOGIC.map((row) => {
              const Icon = row.icon
              return (
                <div
                  key={row.range}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg border",
                    row.color
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-mono font-semibold w-16">
                    {row.range}
                  </span>
                  <span className="text-sm font-medium flex-1">
                    {row.action}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 mt-2">
              Thresholds are configurable per event type and department.
            </p>
            <Link
              href="/waste/settings/thresholds"
              className="mt-1 flex items-center gap-1 text-xs font-medium text-purple-600 no-underline hover:text-purple-700"
            >
              Configure thresholds <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Selected event's detector detail */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          Detectors Applied: {event.label}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Suite: {event.suite} &middot; {event.detectors.length} detectors
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {event.detectors.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
            >
              <span className="text-xs font-mono font-bold text-purple-600">
                {d.id}
              </span>
              <span className="text-xs text-gray-600 truncate">{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">
            Product demonstration
          </p>
          <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
            This page demonstrates how Transparent City&apos;s scoring engine
            would be consumed as a transactional API. Event payloads are
            simulated using real detector mappings. The same scoring logic that
            powers the forensic analysis engine sits behind this API interface.
          </p>
        </div>
      </div>
    </WasteShell>
  )
}
