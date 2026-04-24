"use client"

import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  User,
  MapPin,
  Plus,
  Newspaper,
  BarChart3,
  Loader2,
  Copy,
  Check,
  ArrowRight,
  FileText,
  ExternalLink,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { ContactDialog } from "./contact-dialog"
import { useCrmCitySafe } from "./crm-city-context"
import { useFeedStories } from "@/lib/hooks/useFeed"
import { useCityAnomalies } from "@/lib/hooks/useAnomalies"
import { queueGeneratedEmails } from "@/app/actions/ai-emails"
import type { ContactWithKeywords, Keyword, Template } from "@/lib/types"
import type { FeedStory } from "@/lib/api/feed"
import type { AnomalyResult } from "@/lib/api/anomalies"

type ReferenceKind = "none" | "story" | "anomaly"

interface ManualComposeContentProps {
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
  templates: Template[]
}

export function ManualComposeContent({
  contacts,
  keywords,
  templates,
}: ManualComposeContentProps) {
  const router = useRouter()
  const crmCityCtx = useCrmCitySafe()
  const [saveTransition, startSaveTransition] = useTransition()

  const [contactSearch, setContactSearch] = useState("")
  const [selectedContact, setSelectedContact] = useState<ContactWithKeywords | null>(null)
  const [showContactResults, setShowContactResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [refKind, setRefKind] = useState<ReferenceKind>("none")
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null)
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null)

  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [copied, setCopied] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")

  const emailTemplates = useMemo(
    () => templates.filter((t) => t.channel === "email"),
    [templates],
  )

  const activeContacts = contacts.filter((c) => c.status === "active")
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

  const cityId = selectedContact?.city_id ?? null

  // Parse district number from the contact's jurisdiction field (e.g. "D5", "District 11", "6").
  // District 0 is "citywide" in the data model, so treat it as no district.
  const contactDistrict = useMemo(() => {
    const j = selectedContact?.jurisdiction
    if (!j) return null
    const num = parseInt(j.replace(/\D/g, ""))
    return isNaN(num) || num === 0 ? null : num
  }, [selectedContact?.jurisdiction])

  // Fetch feed stories for the contact's city (only when needed).
  const feedQuery = useFeedStories({
    city_id: cityId ?? undefined,
    limit: 20,
    order_by: "published_at",
    enabled: !!cityId && refKind === "story",
  })
  const stories: FeedStory[] = feedQuery.data?.stories ?? []

  // Fetch recent anomalies for the contact's city (only when needed).
  const anomaliesQuery = useCityAnomalies(
    refKind === "anomaly" ? cityId : null,
    { is_anomaly: true, limit: 30 },
  )
  const anomalies: AnomalyResult[] = anomaliesQuery.data?.results ?? []

  const selectedStory = stories.find((s) => s.id === selectedStoryId) ?? null
  const selectedAnomaly = anomalies.find((a) => a.id === selectedAnomalyId) ?? null

  // Group stories: contact's district first, then everything else
  const districtStories = useMemo(
    () => (contactDistrict ? stories.filter((s) => s.district === contactDistrict) : []),
    [stories, contactDistrict],
  )
  const otherStories = useMemo(
    () => (contactDistrict ? stories.filter((s) => s.district !== contactDistrict) : stories),
    [stories, contactDistrict],
  )

  // Group anomalies: contact's district first, then citywide (district 0 or null)
  const districtAnomalies = useMemo(
    () => (contactDistrict ? anomalies.filter((a) => a.district === contactDistrict) : []),
    [anomalies, contactDistrict],
  )
  const otherAnomalies = useMemo(
    () => (contactDistrict ? anomalies.filter((a) => a.district !== contactDistrict) : anomalies),
    [anomalies, contactDistrict],
  )

  // Close contact dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowContactResults(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const selectContact = useCallback(
    (contact: ContactWithKeywords) => {
      setSelectedContact(contact)
      setContactSearch("")
      setShowContactResults(false)
      // Clear reference selection when switching contacts (city may differ).
      setSelectedStoryId(null)
      setSelectedAnomalyId(null)

      // Keep the sidebar city honest.
      const sidebarCityId = crmCityCtx?.selectedCity?.id
      if (contact.city_id && sidebarCityId && sidebarCityId !== contact.city_id) {
        const matching = crmCityCtx?.cities.find((c) => c.id === contact.city_id)
        if (matching) {
          crmCityCtx?.setSelectedCityId(contact.city_id)
          toast.info(`Switched to ${matching.name}`)
        }
      }
    },
    [crmCityCtx],
  )

  const applyTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId)
      const tpl = emailTemplates.find((t) => t.id === templateId)
      if (!tpl) return
      setSubject(tpl.subject ?? "")
      setBody(tpl.body)
      toast.success(`Applied template "${tpl.name}"`)
    },
    [emailTemplates],
  )

  const insertReference = useCallback(() => {
    const baseUrl =
      (typeof window !== "undefined" && window.location.origin) || "https://transparent.city"
    let snippet = ""
    if (refKind === "story" && selectedStory) {
      const path = selectedStory.canonical_path ?? null
      const url = path
        ? path.startsWith("http")
          ? path
          : `${baseUrl}${path}`
        : selectedStory.public_url ?? ""
      snippet = [selectedStory.headline, selectedStory.description, url]
        .filter(Boolean)
        .join("\n")
    } else if (refKind === "anomaly" && selectedAnomaly) {
      const name = selectedAnomaly.object_name || selectedAnomaly.metric_name || "anomaly"
      const pct =
        selectedAnomaly.pct_change != null
          ? `${selectedAnomaly.pct_change > 0 ? "+" : ""}${Math.round(selectedAnomaly.pct_change * 100)}%`
          : null
      snippet = [
        `${name}${pct ? ` (${pct})` : ""}`,
        selectedAnomaly.period_type ? `Period: ${selectedAnomaly.period_type}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    }
    if (!snippet) {
      toast.error("Pick a story or anomaly first")
      return
    }
    setBody((prev) => (prev.trim() ? `${prev}\n\n${snippet}` : snippet))
    toast.success("Reference inserted")
  }, [refKind, selectedStory, selectedAnomaly])

  const handleCopy = async () => {
    try {
      const text = `Subject: ${subject}\n\n${body}`
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }

  const canSave = !!selectedContact && subject.trim() && body.trim()

  const handleSaveToQueue = () => {
    if (!selectedContact) return
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required")
      return
    }
    startSaveTransition(async () => {
      try {
        await queueGeneratedEmails([
          {
            contactId: selectedContact.id,
            subject: subject.trim(),
            body: body.trim(),
            anomalyIds: [],
          },
        ])
        toast.success("Added to Review & Send")
        router.push("/review-and-send")
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save"
        toast.error(msg)
      }
    })
  }

  const hasReferenceLoading =
    (refKind === "story" && feedQuery.isLoading) ||
    (refKind === "anomaly" && anomaliesQuery.isLoading)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Step 1: recipient */}
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
                        <Badge variant="outline" className="text-xs">
                          {selectedContact.jurisdiction}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedContact(null)
                    setSelectedStoryId(null)
                    setSelectedAnomalyId(null)
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search contacts by name, email, or city..."
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value)
                  setShowContactResults(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredContacts.length > 0) {
                    e.preventDefault()
                    selectContact(filteredContacts[0])
                  }
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
                              <MapPin className="w-3 h-3" />
                              {c.city_name}
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

      {selectedContact && (
        <>
          {/* Step 2: optional reference (story or anomaly) */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-gray-500 uppercase tracking-wide">
                    Reference (optional)
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Attach a feed story or anomaly to cite in the email.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={refKind === "none" ? "default" : "outline"}
                    onClick={() => {
                      setRefKind("none")
                      setSelectedStoryId(null)
                      setSelectedAnomalyId(null)
                    }}
                    className="text-xs h-8"
                  >
                    None
                  </Button>
                  <Button
                    size="sm"
                    variant={refKind === "story" ? "default" : "outline"}
                    onClick={() => setRefKind("story")}
                    className="text-xs h-8 gap-1"
                  >
                    <Newspaper className="w-3.5 h-3.5" />
                    Story
                  </Button>
                  <Button
                    size="sm"
                    variant={refKind === "anomaly" ? "default" : "outline"}
                    onClick={() => setRefKind("anomaly")}
                    className="text-xs h-8 gap-1"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Anomaly
                  </Button>
                </div>
              </div>

              {!selectedContact.city_id && refKind !== "none" && (
                <p className="text-xs text-amber-700">
                  This contact has no city assigned, so no stories or anomalies are available.
                </p>
              )}

              {hasReferenceLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading {refKind === "story" ? "stories" : "anomalies"}...
                </div>
              )}

              {refKind === "story" && !feedQuery.isLoading && cityId && (
                <>
                  {feedQuery.isError ? (
                    <p className="text-xs text-red-600">
                      Failed to load stories. Check your connection and try again.
                    </p>
                  ) : stories.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No feed stories for {selectedContact.city_name ?? "this city"} yet.
                    </p>
                  ) : (
                    <Select
                      value={selectedStoryId ? String(selectedStoryId) : ""}
                      onValueChange={(v) => setSelectedStoryId(Number(v))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Pick a feed story..." />
                      </SelectTrigger>
                      <SelectContent>
                        {districtStories.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>District {contactDistrict}</SelectLabel>
                            {districtStories.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                <span className="line-clamp-1">{s.headline}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {otherStories.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>City Wide</SelectLabel>
                            {otherStories.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                <span className="line-clamp-1">{s.headline}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </>
              )}

              {refKind === "anomaly" && !anomaliesQuery.isLoading && cityId && (
                <>
                  {anomaliesQuery.isError ? (
                    <p className="text-xs text-red-600">
                      Failed to load anomalies. Check your connection and try again.
                    </p>
                  ) : anomalies.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No recent anomalies for {selectedContact.city_name ?? "this city"}.
                    </p>
                  ) : (
                    <Select
                      value={selectedAnomalyId ? String(selectedAnomalyId) : ""}
                      onValueChange={(v) => setSelectedAnomalyId(Number(v))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Pick an anomaly..." />
                      </SelectTrigger>
                      <SelectContent>
                        {districtAnomalies.filter((a) => a.id != null).length > 0 && (
                          <SelectGroup>
                            <SelectLabel>District {contactDistrict}</SelectLabel>
                            {districtAnomalies
                              .filter((a) => a.id != null)
                              .map((a) => {
                                const pct =
                                  a.pct_change != null
                                    ? `${a.pct_change > 0 ? "+" : ""}${Math.round(a.pct_change * 100)}%`
                                    : ""
                                return (
                                  <SelectItem key={a.id!} value={String(a.id)}>
                                    <span className="line-clamp-1">
                                      {a.object_name || a.metric_name || "Anomaly"}
                                      {pct ? ` (${pct})` : ""}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                          </SelectGroup>
                        )}
                        {otherAnomalies.filter((a) => a.id != null).length > 0 && (
                          <SelectGroup>
                            <SelectLabel>City Wide</SelectLabel>
                            {otherAnomalies
                              .filter((a) => a.id != null)
                              .map((a) => {
                                const pct =
                                  a.pct_change != null
                                    ? `${a.pct_change > 0 ? "+" : ""}${Math.round(a.pct_change * 100)}%`
                                    : ""
                                return (
                                  <SelectItem key={a.id!} value={String(a.id)}>
                                    <span className="line-clamp-1">
                                      {a.object_name || a.metric_name || "Anomaly"}
                                      {pct ? ` (${pct})` : ""}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </>
              )}

              {(selectedStory || selectedAnomaly) && (
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="min-w-0 flex-1 text-sm">
                    {selectedStory && (
                      <>
                        <p className="font-medium text-gray-900 truncate">
                          {selectedStory.headline}
                        </p>
                        {selectedStory.description && (
                          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                            {selectedStory.description}
                          </p>
                        )}
                        {selectedStory.canonical_path && (
                          <a
                            href={selectedStory.canonical_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Preview
                          </a>
                        )}
                      </>
                    )}
                    {selectedAnomaly && (
                      <>
                        <p className="font-medium text-gray-900 truncate">
                          {selectedAnomaly.object_name ||
                            selectedAnomaly.metric_name ||
                            "Anomaly"}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {selectedAnomaly.pct_change != null && (
                            <span>
                              {selectedAnomaly.pct_change > 0 ? "+" : ""}
                              {Math.round(selectedAnomaly.pct_change * 100)}%
                            </span>
                          )}
                          {selectedAnomaly.period_type && (
                            <span className="ml-2 text-gray-500">
                              · {selectedAnomaly.period_type}
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={insertReference}
                    className="gap-1 shrink-0 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Insert into body
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: optional template */}
          {emailTemplates.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">
                      Template (optional)
                    </Label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Prefill subject and body from a saved template.
                    </p>
                  </div>
                  {selectedTemplateId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedTemplateId("")}
                      className="text-xs h-8 gap-1 text-gray-500"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
                <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Pick a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          {t.name}
                          {t.category && (
                            <span className="text-xs text-gray-400">· {t.category}</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Step 4: subject + body */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label htmlFor="manual-subject" className="text-xs text-gray-500 uppercase tracking-wide">
                  Subject
                </Label>
                <Input
                  id="manual-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="manual-body" className="text-xs text-gray-500 uppercase tracking-wide">
                  Body
                </Label>
                <Textarea
                  id="manual-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  placeholder="Write your message here..."
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!subject.trim() && !body.trim()}
                  className="gap-1.5 text-xs"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy Email"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveToQueue}
                  disabled={!canSave || saveTransition}
                  className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {saveTransition ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  Save & Review
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedContact && (
        <div className="text-center py-8">
          <User className="w-10 h-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500">
            Pick a contact, then write or paste your email.
          </p>
        </div>
      )}
    </div>
  )
}
