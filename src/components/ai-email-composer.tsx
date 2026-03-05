"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  Wand2, 
  Send, 
  Users, 
  AlertTriangle, 
  ChevronDown,
  ChevronRight,
  Mail,
  Loader2,
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  Sparkles,
  FileText,
  RefreshCw,
} from "lucide-react"
import type { Contact, Keyword, Anomaly } from "@/lib/types"
import { queueGeneratedEmails } from "@/app/actions/ai-emails"

interface ContactWithKeywords extends Contact {
  prospect_keywords?: Array<{
    keyword_id: string
    keywords: { id: string; name: string } | null
  }>
}

interface AnomalyWithKeywords extends Anomaly {
  anomaly_keywords?: Array<{
    keyword_id: string
    keywords: { id: string; name: string } | null
  }>
}

interface GeneratedEmail {
  subject: string
  body: string
  contactId: string
  anomalyIds: string[]
}

interface AIEmailComposerProps {
  contacts: ContactWithKeywords[]
  anomalies: AnomalyWithKeywords[]
  keywords: Keyword[]
}

export function AIEmailComposer({ contacts, anomalies, keywords }: AIEmailComposerProps) {
  const [step, setStep] = useState<"compose" | "select" | "generate" | "review">("compose")
  
  // Compose state
  const [sampleSubject, setSampleSubject] = useState("")
  const [sampleEmail, setSampleEmail] = useState("")
  const [voiceNotes, setVoiceNotes] = useState("")
  const [includeAnomalies, setIncludeAnomalies] = useState(true)
  
  // Selection state
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [keywordFilter, setKeywordFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationPhase, setGenerationPhase] = useState<
    "idle" | "fetching" | "matching" | "generating" | "finalizing"
  >("idle")
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([])
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [skippedContacts, setSkippedContacts] = useState<string[]>([])
  
  // Review state
  const [previewEmail, setPreviewEmail] = useState<GeneratedEmail | null>(null)
  const [isQueueing, setIsQueueing] = useState(false)

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchesKeyword = keywordFilter === "all" || 
        contact.prospect_keywords?.some(ck => ck.keyword_id === keywordFilter)
      const matchesPriority = priorityFilter === "all" ||
        (priorityFilter === "high" && contact.priority >= 4) ||
        (priorityFilter === "medium" && contact.priority >= 2 && contact.priority < 4) ||
        (priorityFilter === "low" && contact.priority < 2)
      return matchesKeyword && matchesPriority
    })
  }, [contacts, keywordFilter, priorityFilter])

  // Get contact by ID
  const getContact = (id: string) => contacts.find(c => c.id === id)
  
  // Get anomaly by ID
  const getAnomaly = (id: string) => anomalies.find(a => a.id === id)

  // Count matched anomalies for a contact (district + keywords + citywide)
  const countMatchedAnomalies = (contact: ContactWithKeywords) => {
    const contactKeywordIds = contact.prospect_keywords?.map(ck => ck.keyword_id) || []
    const contactJurisdiction = contact.jurisdiction?.toLowerCase()?.trim() || ""
    
    return anomalies.filter(anomaly => {
      // District match
      if (anomaly.district_label && contactJurisdiction) {
        const anomalyDistrict = anomaly.district_label.toLowerCase().trim()
        if (contactJurisdiction.includes(anomalyDistrict) || 
            anomalyDistrict.includes(contactJurisdiction) ||
            contactJurisdiction.replace(/\D/g, '') === anomalyDistrict.replace(/\D/g, '')) {
          return true
        }
      }
      // Keyword match
      const anomalyKeywordIds = anomaly.anomaly_keywords?.map(ak => ak.keyword_id) || []
      if (anomalyKeywordIds.some(id => contactKeywordIds.includes(id))) {
        return true
      }
      // Citywide match
      if (anomaly.is_citywide) {
        return true
      }
      return false
    }).length
  }
  
  // Get display title for an anomaly
  const getAnomalyTitle = (anomaly: AnomalyWithKeywords) => {
    if (anomaly.title) return anomaly.title
    if (anomaly.group_field && anomaly.group_value) {
      const pctStr = anomaly.pct_change 
        ? ` (${anomaly.pct_change > 0 ? '+' : ''}${Math.round(anomaly.pct_change)}%)`
        : ''
      return `${anomaly.group_field}: ${anomaly.group_value}${pctStr}`
    }
    return `Anomaly #${anomaly.id}`
  }

  // Handle select all filtered contacts
  const handleSelectAll = () => {
    const filteredIds = filteredContacts.map(c => c.id)
    if (filteredIds.every(id => selectedContacts.includes(id))) {
      setSelectedContacts(selectedContacts.filter(id => !filteredIds.includes(id)))
    } else {
      setSelectedContacts([...new Set([...selectedContacts, ...filteredIds])])
    }
  }

  // Phase display labels
  const phaseLabels: Record<string, string> = {
    idle: "",
    fetching: "Fetching contact details...",
    matching: "Matching anomalies to keywords...",
    generating: `Generating ${selectedContacts.length} unique email variations...`,
    finalizing: "Finalizing emails...",
  }

  // Generate emails via API
  const handleGenerate = async () => {
    if (selectedContacts.length === 0) {
      setGenerationError("Please select at least one contact")
      return
    }
    if (!sampleEmail.trim()) {
      setGenerationError("Please write a sample email first")
      return
    }

    setIsGenerating(true)
    setGenerationError(null)
    setSkippedContacts([])
    setGenerationPhase("fetching")

    // Advance phases on timers — the API does all steps in one call,
    // but showing progress keeps the user informed.
    const phaseTimers = [
      setTimeout(() => setGenerationPhase("matching"), 1500),
      setTimeout(() => setGenerationPhase("generating"), 3500),
    ]

    try {
      const response = await fetch("/api/generate-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleEmail,
          sampleSubject,
          contactIds: selectedContacts,
          voiceNotes,
          includeAnomalies,
          anomalies: includeAnomalies ? anomalies : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate emails")
      }

      setGenerationPhase("finalizing")

      // Check for skipped contacts
      if (data.skippedContacts?.length > 0) {
        setSkippedContacts(data.skippedContacts)
      }

      // Check if any selected contacts are missing from results
      const returnedIds = (data.emails || []).map((e: GeneratedEmail) => e.contactId)
      const missingIds = selectedContacts.filter(id => !returnedIds.includes(id))
      if (missingIds.length > 0) {
        const missingNames = missingIds
          .map(id => contacts.find(c => c.id === id)?.name || id)
        setSkippedContacts(prev => [...new Set([...prev, ...missingNames])])
      }

      setGeneratedEmails(data.emails || [])
      // Small delay so "Finalizing..." is visible
      await new Promise(r => setTimeout(r, 500))
      setStep("review")
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Generation failed")
    } finally {
      phaseTimers.forEach(clearTimeout)
      setIsGenerating(false)
      setGenerationPhase("idle")
    }
  }

  // Skip AI and use the exact same email for all selected contacts.
  // Useful for situations like "CC'ing" a district update to multiple staff members,
  // while still recording an individual message per contact in the CRM.
  const handleUseSameCopyForAll = () => {
    if (selectedContacts.length === 0) {
      setGenerationError("Please select at least one contact")
      return
    }
    if (!sampleEmail.trim()) {
      setGenerationError("Please write a sample email first")
      return
    }

    setGenerationError(null)
    setGeneratedEmails(
      selectedContacts.map((contactId) => ({
        subject: sampleSubject || "",
        body: sampleEmail,
        contactId,
        anomalyIds: [],
      }))
    )
    setStep("review")
  }

  // Queue emails for sending
  const handleQueueEmails = async () => {
    setIsQueueing(true)
    try {
      await queueGeneratedEmails(generatedEmails)
      // Reset state
      setGeneratedEmails([])
      setSelectedContacts([])
      setSampleEmail("")
      setSampleSubject("")
      setStep("compose")
      alert(`${generatedEmails.length} emails queued for sending!`)
    } catch (error) {
      alert("Failed to queue emails: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsQueueing(false)
    }
  }

  // Regenerate a single email
  const handleRegenerateOne = async (contactId: string) => {
    const contact = getContact(contactId)
    if (!contact) return

    setIsGenerating(true)
    try {
      const response = await fetch("/api/generate-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleEmail,
          sampleSubject,
          contactIds: [contactId],
          voiceNotes,
          includeAnomalies,
          anomalies: includeAnomalies ? anomalies : undefined,
        }),
      })

      const data = await response.json()
      if (data.emails?.[0]) {
        setGeneratedEmails(prev => 
          prev.map(e => e.contactId === contactId ? data.emails[0] : e)
        )
      }
    } catch (error) {
      console.error("Regeneration failed:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps - pill style like main app */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {[
          { key: "compose", label: "Write Sample", icon: FileText },
          { key: "select", label: "Select Contacts", icon: Users },
          { key: "generate", label: "Generate", icon: Sparkles },
          { key: "review", label: "Review & Send", icon: Send },
        ].map((s, i) => (
          <button
            key={s.key}
            onClick={() => {
              if (s.key === "compose" || 
                  (s.key === "select" && sampleEmail) ||
                  (s.key === "generate" && selectedContacts.length > 0) ||
                  (s.key === "review" && generatedEmails.length > 0)) {
                setStep(s.key as typeof step)
              }
            }}
            className="flex items-center gap-2 transition-all"
            style={{
              padding: '10px 20px',
              background: step === s.key ? 'var(--brand-primary)' : 'var(--bg-primary)',
              border: `1px solid ${step === s.key ? 'var(--brand-primary)' : 'var(--border-primary)'}`,
              borderRadius: '24px',
              fontSize: '14px',
              fontWeight: 500,
              color: step === s.key ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <s.icon className="w-4 h-4 shrink-0" />
            <span>{i + 1}. {s.label}</span>
          </button>
        ))}
      </div>

      {/* Step 1: Compose Sample */}
      {step === "compose" && (
        <div 
          className="rounded-2xl transition-all"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="p-6 pb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              <FileText className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              Write Your Sample Email
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Write one email in your voice. Claude will create unique variations for each contact while matching relevant anomalies to their interests.
            </p>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                placeholder="e.g., Important Data Update for Your District"
                value={sampleSubject}
                onChange={(e) => setSampleSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Sample Email Body</Label>
              <Textarea
                id="email"
                placeholder={`Dear Commissioner,

I hope this message finds you well. I'm reaching out from Transparent City regarding some data anomalies we've identified that may be relevant to your district.

We've noticed some discrepancies in recent permit data that we think your office should be aware of. These patterns suggest potential issues worth investigating.

I'd welcome the opportunity to discuss these findings in more detail at your convenience.

Best regards,
Sarah Chen
Transparent City`}
                value={sampleEmail}
                onChange={(e) => setSampleEmail(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Just write naturally. Claude will personalize each email with the recipient's name, title, jurisdiction, and relevant anomalies.
              </p>
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="gap-2 p-0 h-auto">
                  <ChevronRight className="w-4 h-4 transition-transform ui-open:rotate-90" />
                  Advanced Options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voice">Voice & Style Notes (Optional)</Label>
                  <Textarea
                    id="voice"
                    placeholder="e.g., Keep it formal but approachable. Emphasize urgency without being alarmist. Use data-driven language."
                    value={voiceNotes}
                    onChange={(e) => setVoiceNotes(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-anomalies"
                    checked={includeAnomalies}
                    onCheckedChange={(checked) => setIncludeAnomalies(checked === true)}
                  />
                  <Label htmlFor="include-anomalies" className="font-normal">
                    Automatically include relevant anomalies based on contact interests
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex justify-end pt-4">
              <button 
                onClick={() => setStep("select")} 
                disabled={!sampleEmail.trim()}
                className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: 'var(--brand-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                <span>Continue to Select Contacts</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Select Contacts */}
      {step === "select" && (
        <div 
          className="rounded-2xl"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="p-6 pb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              <Users className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              Select Recipients
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Choose which contacts should receive personalized versions of your email.
              {includeAnomalies && " Anomalies will be matched based on shared keywords."}
            </p>
          </div>
          <div className="px-6 pb-6 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={keywordFilter} onValueChange={setKeywordFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by keyword" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Keywords</SelectItem>
                    {keywords.map(kw => (
                      <SelectItem key={kw.id} value={kw.id}>{kw.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High (4-5)</SelectItem>
                  <SelectItem value="medium">Medium (2-3)</SelectItem>
                  <SelectItem value="low">Low (1)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {filteredContacts.every(c => selectedContacts.includes(c.id)) 
                  ? "Deselect All" 
                  : "Select All Filtered"}
              </Button>
              <Badge variant="secondary">
                {selectedContacts.length} selected
              </Badge>
            </div>

            {/* Contact List */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="p-4 space-y-2">
                {filteredContacts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No contacts match your filters
                  </p>
                ) : (
                  filteredContacts.map(contact => {
                    const matchedCount = countMatchedAnomalies(contact)
                    const isSelected = selectedContacts.includes(contact.id)
                    
                    return (
                      <div
                        key={contact.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected 
                            ? "border-purple-600 bg-purple-50" 
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          setSelectedContacts(prev =>
                            isSelected
                              ? prev.filter(id => id !== contact.id)
                              : [...prev, contact.id]
                          )
                        }}
                      >
                        <Checkbox checked={isSelected} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{contact.name}</span>
                            <Badge variant="outline" className="text-xs">
                              P{contact.priority}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {contact.title && `${contact.title} • `}
                            {contact.organization || contact.jurisdiction || "No org"}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {contact.prospect_keywords?.slice(0, 3).map(ck => (
                              <Badge key={ck.keyword_id} variant="secondary" className="text-xs">
                                {ck.keywords?.name}
                              </Badge>
                            ))}
                            {(contact.prospect_keywords?.length || 0) > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(contact.prospect_keywords?.length || 0) - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {includeAnomalies && matchedCount > 0 && (
                          <Badge variant="default" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {matchedCount} anomal{matchedCount !== 1 ? "ies" : "y"}
                          </Badge>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            <div className="flex justify-between pt-4">
              <button 
                onClick={() => setStep("compose")} 
                className="transition-all"
                style={{
                  padding: '12px 20px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Back to Edit
              </button>
              <button 
                onClick={() => setStep("generate")} 
                disabled={selectedContacts.length === 0}
                className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: 'var(--brand-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                <span>Continue to Generate</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Generate */}
      {step === "generate" && (
        <div 
          className="rounded-2xl"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="p-6 pb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              <Sparkles className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              Generate Unique Emails
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Claude will create {selectedContacts.length} unique email{selectedContacts.length !== 1 ? "s" : ""}, 
              each personalized and varied to avoid spam detection.
            </p>
          </div>
          <div className="px-6 pb-6 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{selectedContacts.length}</div>
                <div className="text-sm text-muted-foreground">Contacts</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-2xl font-bold">
                  {includeAnomalies ? anomalies.length : 0}
                </div>
                <div className="text-sm text-muted-foreground">Available Anomalies</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-2xl font-bold">~{Math.ceil(selectedContacts.length * 0.5)}min</div>
                <div className="text-sm text-muted-foreground">Est. Generation Time</div>
              </div>
            </div>

            {/* Preview of sample */}
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="gap-2 w-full justify-start">
                  <ChevronDown className="w-4 h-4" />
                  Preview Sample Email
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 border rounded-lg bg-muted/30 mt-2">
                  <div className="text-sm font-medium mb-2">Subject: {sampleSubject || "(No subject)"}</div>
                  <div className="text-sm whitespace-pre-wrap">{sampleEmail}</div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Generation progress indicator */}
            {isGenerating && (
              <div className="p-6 rounded-lg border" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary, var(--bg-primary))' }}>
                <div className="space-y-4">
                  {(["fetching", "matching", "generating", "finalizing"] as const).map((phase, idx) => {
                    const isActive = generationPhase === phase
                    const phases = ["fetching", "matching", "generating", "finalizing"] as const
                    const currentIdx = phases.indexOf(generationPhase as typeof phases[number])
                    const isDone = currentIdx > idx
                    return (
                      <div key={phase} className="flex items-center gap-3">
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                        ) : isActive ? (
                          <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: 'var(--brand-primary)' }} />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--border-primary)' }} />
                        )}
                        <span
                          className="text-sm font-medium transition-colors"
                          style={{
                            color: isActive
                              ? 'var(--text-primary)'
                              : isDone
                                ? 'var(--text-secondary)'
                                : 'var(--text-muted, var(--text-secondary))',
                            opacity: !isActive && !isDone ? 0.5 : 1,
                          }}
                        >
                          {phaseLabels[phase]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {generationError && (
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                {generationError}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep("select")}
                disabled={isGenerating}
                className="transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: '12px 20px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Back to Select
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleUseSameCopyForAll}
                  disabled={isGenerating}
                  className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    padding: "12px 20px",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                  title='Queue identical copies (useful for "CC" style outreach)'
                >
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>Use Same Copy for All</span>
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    padding: '12px 24px',
                    background: 'var(--brand-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 shrink-0" />
                      <span>Generate Emails with AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === "review" && (
        <div 
          className="rounded-2xl"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="p-6 pb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--brand-primary)' }} />
              Review Generated Emails
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {generatedEmails.length} unique emails generated. Review and edit before sending.
            </p>
          </div>
          <div className="px-6 pb-6 space-y-4">
            {skippedContacts.length > 0 && (
              <div className="p-4 rounded-lg border flex items-start gap-3" style={{ background: 'rgba(234, 179, 8, 0.08)', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#d97706' }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {skippedContacts.length} contact{skippedContacts.length !== 1 ? "s" : ""} skipped
                  </div>
                  <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    No email was generated for: <strong>{skippedContacts.join(", ")}</strong>.
                    This can happen if the contact is no longer active or if AI generation failed for that contact.
                  </div>
                </div>
              </div>
            )}
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {generatedEmails.map((email, index) => {
                  const contact = getContact(email.contactId)
                  return (
                    <div
                      key={email.contactId}
                      className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span className="font-medium">{contact?.name || "Unknown"}</span>
                            {contact?.organization && (
                              <span className="text-sm text-muted-foreground">
                                • {contact.organization}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground mb-2">
                            Subject: {email.subject}
                          </div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {email.body.substring(0, 200)}...
                          </div>
                          {email.anomalyIds.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <AlertTriangle className="w-3 h-3 text-warning" />
                              <span className="text-xs text-muted-foreground">
                                Includes {email.anomalyIds.length} anomal{email.anomalyIds.length !== 1 ? "ies" : "y"}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewEmail(email)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRegenerateOne(email.contactId)}
                            disabled={isGenerating}
                          >
                            <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            <div className="flex justify-between pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <button 
                onClick={() => setStep("generate")} 
                className="transition-all"
                style={{
                  padding: '12px 20px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    padding: '12px 20px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 ${isGenerating ? "animate-spin" : ""}`} />
                  <span>Regenerate All</span>
                </button>
                <button 
                  onClick={handleQueueEmails} 
                  disabled={isQueueing}
                  className="flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    padding: '12px 24px',
                    background: 'var(--brand-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {isQueueing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Queueing...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 shrink-0" />
                      <span>Queue {generatedEmails.length} Emails</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview Dialog */}
      <Dialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Preview
            </DialogTitle>
          </DialogHeader>
          {previewEmail && (
            <div className="flex-1 overflow-auto">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">TO</Label>
                  <div className="font-medium">
                    {getContact(previewEmail.contactId)?.name} 
                    {getContact(previewEmail.contactId)?.email && (
                      <span className="text-muted-foreground font-normal">
                        {" "}&lt;{getContact(previewEmail.contactId)?.email}&gt;
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SUBJECT</Label>
                  <div className="font-medium">{previewEmail.subject}</div>
                </div>
                <div className="border-t pt-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {previewEmail.body}
                  </div>
                </div>
                {previewEmail.anomalyIds.length > 0 && (
                  <div className="border-t pt-4">
                    <Label className="text-xs text-muted-foreground">INCLUDED ANOMALIES</Label>
                    <div className="space-y-2 mt-2">
                      {previewEmail.anomalyIds.map(id => {
                        const anomaly = getAnomaly(id)
                        return anomaly ? (
                          <div key={id} className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            <span className="font-medium">{getAnomalyTitle(anomaly)}</span>
                            {anomaly.district_label && (
                              <Badge variant="secondary" className="text-xs">
                                {anomaly.district_label}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {anomaly.severity || 'medium'}
                            </Badge>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
