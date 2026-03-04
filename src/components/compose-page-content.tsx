"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth0 } from "@auth0/auth0-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Sparkles,
  Loader2,
  Users,
  User,
  Search,
  Plus,
  MapPin,
  BarChart3,
  ExternalLink,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRightLeft,
  Copy,
  CheckCircle2,
  Mail,
} from "lucide-react"
import { API_BASE, CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { ContactDialog } from "./contact-dialog"
import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import { DashboardShell } from "@/components/dashboard-shell"
import { AIEmailComposer } from "@/components/ai-email-composer"
import type { ContactWithKeywords, Keyword, Anomaly } from "@/lib/types"

interface AnomalyOption {
  result_id: number
  snippet: string
  object_name: string
  pct_change: number
  period_type: string
  district: number | null
  city_name?: string
}

interface ComposeResult {
  subject: string
  body: string
  anomaly_snippet: string
  chart_url: string
  queue_item_id: string | null
  prospect: {
    id: string
    name: string
    email: string
    city_name: string
  }
}

interface ComposePageContentProps {
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
}

export function ComposePageContent({ contacts, keywords }: ComposePageContentProps) {
  const router = useRouter()
  const { getAccessTokenSilently } = useAuth0()

  const getAuthHeaders = useCallback(async (contentType?: boolean) => {
    const headers: Record<string, string> = {}
    try {
      const token = await getAccessTokenSilently()
      headers["Authorization"] = `Bearer ${token}`
    } catch {
      // In dev mode, auth may not be configured
    }
    if (contentType) headers["Content-Type"] = "application/json"
    return headers
  }, [getAccessTokenSilently])

  const { data, isLoading } = useAnomalies({
    is_anomaly: true,
    limit: 500,
    city_id: CRM_DEFAULT_CITY_ID,
  })

  // Contact search/selection
  const [contactSearch, setContactSearch] = useState("")
  const [selectedContact, setSelectedContact] = useState<ContactWithKeywords | null>(null)
  const [showContactResults, setShowContactResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Anomaly state
  const [anomalies, setAnomalies] = useState<AnomalyOption[]>([])
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyOption | null>(null)
  const [loadingAnomalies, setLoadingAnomalies] = useState(false)
  const [showAnomalyPicker, setShowAnomalyPicker] = useState(false)

  // Draft state
  const [draftSubject, setDraftSubject] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const [chartUrl, setChartUrl] = useState("")
  const [queueItemId, setQueueItemId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [refinement, setRefinement] = useState("")
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const activeContacts = contacts.filter((c) => c.status === "active")

  // Filter contacts by search
  const filteredContacts = contactSearch.length >= 1
    ? activeContacts.filter((c) => {
        const q = contactSearch.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.organization?.toLowerCase().includes(q) ||
          c.city_name?.toLowerCase().includes(q)
        )
      }).slice(0, 8)
    : activeContacts.slice(0, 8)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowContactResults(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // When a contact is selected, fetch anomalies for their city
  const selectContact = useCallback(async (contact: ContactWithKeywords) => {
    setSelectedContact(contact)
    setContactSearch("")
    setShowContactResults(false)
    setDraftSubject("")
    setDraftBody("")
    setChartUrl("")
    setQueueItemId(null)
    setRefinement("")
    setSelectedAnomaly(null)
    setAnomalies([])
    setSaved(false)

    if (!contact.city_id) {
      return // No city, can't fetch anomalies
    }

    setLoadingAnomalies(true)
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch(`${API_BASE}/api/crm/cities/${contact.city_id}/anomalies?lookback_days=90&limit=30`, { headers })
      if (!resp.ok) throw new Error("Failed to fetch anomalies")
      const data = await resp.json()
      const fetched: AnomalyOption[] = data.anomalies || []
      setAnomalies(fetched)

      // Auto-select the top anomaly and generate immediately
      if (fetched.length > 0) {
        const top = fetched[0]
        setSelectedAnomaly(top)
        // Auto-generate
        await generateDraft(contact, top, "")
      }
    } catch (err) {
      console.error("Fetch anomalies error:", err)
    } finally {
      setLoadingAnomalies(false)
    }
  }, [])

  // Generate a draft
  const generateDraft = useCallback(async (
    contact: ContactWithKeywords,
    anomaly: AnomalyOption,
    refineText: string,
  ) => {
    setIsGenerating(true)
    setSaved(false)
    try {
      const composeHeaders = await getAuthHeaders(true)
      const resp = await fetch(`${API_BASE}/api/crm/compose`, {
        method: "POST",
        headers: composeHeaders,
        body: JSON.stringify({
          prospect_id: contact.id,
          anomaly_result_id: anomaly.result_id,
          refinement: refineText || null,
          save_to_queue: true,
        }),
      })
      if (!resp.ok) throw new Error("Failed to compose draft")
      const data: ComposeResult = await resp.json()
      setDraftSubject(data.subject)
      setDraftBody(data.body)
      setChartUrl(data.chart_url)
      setQueueItemId(data.queue_item_id)
      setSaved(true)
    } catch (err) {
      console.error("Compose error:", err)
    } finally {
      setIsGenerating(false)
    }
  }, [])

  // Swap anomaly
  const handleSwapAnomaly = useCallback(async (anomaly: AnomalyOption) => {
    setSelectedAnomaly(anomaly)
    setShowAnomalyPicker(false)
    if (selectedContact) {
      await generateDraft(selectedContact, anomaly, refinement)
    }
  }, [selectedContact, refinement, generateDraft])

  // Regenerate with same anomaly
  const handleRegenerate = useCallback(async () => {
    if (selectedContact && selectedAnomaly) {
      await generateDraft(selectedContact, selectedAnomaly, refinement)
    }
  }, [selectedContact, selectedAnomaly, refinement, generateDraft])

  // Refine: regenerate with the refinement text
  const handleRefine = useCallback(async () => {
    if (selectedContact && selectedAnomaly && refinement.trim()) {
      await generateDraft(selectedContact, selectedAnomaly, refinement)
    }
  }, [selectedContact, selectedAnomaly, refinement, generateDraft])

  // Copy email
  const handleCopy = async () => {
    try {
      const text = `Subject: ${draftSubject}\n\n${draftBody}`
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copy failed:", err)
    }
  }

  const hasDraft = draftSubject || draftBody

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Step 1: Contact picker */}
      <div ref={searchRef} className="relative">
        {selectedContact ? (
          <Card className="border-purple-200 bg-purple-50/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{selectedContact.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      {selectedContact.email && <span>{selectedContact.email}</span>}
                      {selectedContact.city_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {selectedContact.city_name}
                        </span>
                      )}
                      {selectedContact.jurisdiction && (
                        <Badge variant="outline" className="text-xs">{selectedContact.jurisdiction}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedContact(null)
                    setDraftSubject("")
                    setDraftBody("")
                    setChartUrl("")
                    setSelectedAnomaly(null)
                    setAnomalies([])
                    setRefinement("")
                    setSaved(false)
                  }}
                  className="text-xs text-gray-500"
                >
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search contacts by name, email, or city..."
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value)
                  setShowContactResults(true)
                }}
                onFocus={() => setShowContactResults(true)}
                className="pl-9 h-12 text-base"
                autoFocus
              />
            </div>
            {showContactResults && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-50 max-h-72 overflow-y-auto">
                {filteredContacts.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">
                    {contactSearch ? "No contacts found" : "No active contacts"}
                  </div>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectContact(c)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{c.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {c.email && <span className="truncate">{c.email}</span>}
                          {c.city_name && (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <MapPin className="w-3 h-3" />{c.city_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {!c.city_id && (
                        <span className="text-xs text-amber-600 shrink-0">No city</span>
                      )}
                    </button>
                  ))
                )}
                <div className="border-t">
                  <ContactDialog keywords={keywords}>
                    <button className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-purple-600">
                      <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm font-medium">New Contact</span>
                    </button>
                  </ContactDialog>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* No city warning */}
      {selectedContact && !selectedContact.city_id && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            This contact doesn't have a city assigned, so there are no anomalies to match.
            Edit this contact to assign a city first.
          </CardContent>
        </Card>
      )}

      {/* Loading anomalies */}
      {loadingAnomalies && (
        <div className="flex items-center gap-3 text-sm text-gray-500 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Finding anomalies and generating draft...
        </div>
      )}

      {/* No anomalies found */}
      {selectedContact && selectedContact.city_id && !loadingAnomalies && anomalies.length === 0 && !isGenerating && (
        <Card className="border-gray-200">
          <CardContent className="p-6 text-center">
            <BarChart3 className="w-8 h-8 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">
              No recent anomalies found for {selectedContact.city_name || "this city"} in the last 14 days.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Draft area */}
      {(hasDraft || isGenerating) && selectedContact && selectedAnomaly && (
        <div className="space-y-4">
          {/* Anomaly bar with swap */}
          <div className="relative">
            <button
              onClick={() => setShowAnomalyPicker(!showAnomalyPicker)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                showAnomalyPicker
                  ? "border-purple-300 bg-purple-50"
                  : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <BarChart3 className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 text-gray-700 truncate">{selectedAnomaly.snippet}</span>
              {chartUrl && (
                <a
                  href={chartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-purple-600 hover:text-purple-800 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <Badge variant="outline" className="text-xs shrink-0">
                {anomalies.length} available
              </Badge>
              {showAnomalyPicker ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>

            {showAnomalyPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border z-40 max-h-60 overflow-y-auto">
                {anomalies.map((a) => {
                  const isCurrent = a.result_id === selectedAnomaly.result_id
                  return (
                    <button
                      key={a.result_id}
                      onClick={() => !isCurrent && handleSwapAnomaly(a)}
                      disabled={isCurrent}
                      className={`w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                        isCurrent
                          ? "bg-purple-50 text-purple-800"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {isCurrent ? (
                        <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      ) : (
                        <ArrowRightLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      )}
                      <span className="flex-1 truncate">{a.snippet}</span>
                      {a.district != null && a.district !== 0 && (
                        <Badge variant="outline" className="text-xs">D{a.district}</Badge>
                      )}
                      {(a.district == null || a.district === 0) && (
                        <Badge variant="outline" className="text-xs">Citywide</Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* The draft */}
          <Card>
            <CardContent className="p-5 space-y-4">
              {isGenerating ? (
                <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {refinement ? "Refining draft..." : "Generating draft..."}
                </div>
              ) : (
                <>
                  {/* Subject */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <Label className="text-xs text-gray-500 uppercase tracking-wide">Subject</Label>
                    </div>
                    <p className="font-medium text-gray-900">{draftSubject}</p>
                  </div>

                  {/* Body */}
                  <div className="text-sm text-gray-700 whitespace-pre-wrap p-4 bg-gray-50 rounded-lg border border-gray-100">
                    {draftBody}
                  </div>

                  {/* Refine input */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">
                      Add context to refine (optional)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. mention the upcoming budget meeting, use a more urgent tone..."
                        value={refinement}
                        onChange={(e) => setRefinement(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && refinement.trim()) {
                            handleRefine()
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefine}
                        disabled={!refinement.trim() || isGenerating}
                        className="gap-1.5 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Refine
                      </Button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerate}
                        disabled={isGenerating}
                        className="gap-1.5 text-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        className="gap-1.5 text-xs"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy Email"}
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push("/review-and-send")}
                      className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                      {saved ? "Saved" : "Go to"} Review & Send
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Helpful hint when nothing is selected */}
      {!selectedContact && (
        <div className="text-center py-8">
          <Users className="w-10 h-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">
            Select a contact to compose a personalized anomaly email
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {activeContacts.length} active contact{activeContacts.length !== 1 ? "s" : ""} available
          </p>
        </div>
      )}
    </div>
  )
}
