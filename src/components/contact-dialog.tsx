"use client"

import React, { useState, useTransition, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Contact, Keyword } from "@/lib/types"
import { createContact, updateContact } from "@/app/actions/contacts"
import { X, MapPin } from "lucide-react"
import { searchPublicCities } from "@/lib/publicApiClient"

// Pinned cities for quick selection
const PINNED_CITIES = [
  { id: 1, name: "San Francisco", state: "CA" },
]

interface ContactWithKeywords extends Omit<Contact, "article_links"> {
  keywords?: Keyword[]
  article_links?: Array<{ url: string; id?: string }>
}

interface ContactDialogProps {
  contact?: ContactWithKeywords
  keywords: Keyword[]
  children: React.ReactNode
}

export function ContactDialog({ contact, keywords, children }: ContactDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [contactType, setContactType] = useState<string>(
    contact?.contact_type || "city_staff"
  )
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(
    contact?.keywords?.map((k) => k.id) || []
  )
  const articleUrls =
    (contact as ContactWithKeywords)?.article_links?.map((a) => a.url).join("\n") ?? ""

  // City search state
  const [cityQuery, setCityQuery] = useState(contact?.city_name || "")
  const [cityId, setCityId] = useState<number | null>(contact?.city_id || null)
  const [cityResults, setCityResults] = useState<Array<{ id: number; name: string; state?: string }>>([])
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const cityRef = useRef<HTMLDivElement>(null)

  // Search cities as user types
  useEffect(() => {
    if (cityQuery.length < 2) {
      setCityResults([])
      return
    }
    // If we already selected a city with this exact name, don't search
    if (cityId && cityQuery === contact?.city_name) return

    const timer = setTimeout(async () => {
      try {
        const results = await searchPublicCities(cityQuery, 8)
        setCityResults(results.map(r => ({ id: r.id, name: r.name, state: (r as any).state })))
        setShowCityDropdown(true)
      } catch {
        setCityResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [cityQuery, cityId, contact?.city_name])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const selectCity = (city: { id: number; name: string; state?: string }) => {
    const displayName = city.state ? `${city.name}, ${city.state}` : city.name
    setCityId(city.id)
    setCityQuery(displayName)
    setShowCityDropdown(false)
  }

  const clearCity = () => {
    setCityId(null)
    setCityQuery("")
    setCityResults([])
  }

  const handleSubmit = async (formData: FormData) => {
    formData.append("contact_type", contactType)
    formData.append("keywords", JSON.stringify(selectedKeywords))
    if (cityId) formData.append("city_id", String(cityId))
    formData.append("city_name", cityQuery)
    const urls = formData.get("article_urls") as string
    formData.set(
      "article_urls",
      JSON.stringify(
        urls
          ?.split(/[\n,;]/)
          .map((s) => s.trim())
          .filter(Boolean) ?? []
      )
    )

    startTransition(async () => {
      if (contact) {
        await updateContact(contact.id, formData)
      } else {
        await createContact(formData)
      }
      setOpen(false)
    })
  }

  const toggleKeyword = (keywordId: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keywordId)
        ? prev.filter((id) => id !== keywordId)
        : [...prev, keywordId]
    )
  }

  const isMedia = contactType === "media"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={contactType}
              onValueChange={(v) => setContactType(v)}
              name="contact_type"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="elected_official">Elected Official</SelectItem>
                <SelectItem value="city_staff">City Staff</SelectItem>
                <SelectItem value="media">Press / Media</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
                <SelectItem value="nonprofit">Nonprofit</SelectItem>
                <SelectItem value="lobbyist">Lobbyist</SelectItem>
                <SelectItem value="community_leader">Community Leader</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={contact?.name}
                required
                placeholder={isMedia ? "Jane Reporter" : "John Smith"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={contact?.title ?? ""}
                placeholder={isMedia ? "City Hall Reporter" : "City Council Member"}
              />
            </div>
          </div>

          {isMedia ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="outlet_platform">Outlet / Platform</Label>
                  <Input
                    id="outlet_platform"
                    name="outlet_platform"
                    defaultValue={contact?.outlet_platform ?? ""}
                    placeholder="SF Chronicle, NPR"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primary_beat">Primary Beat / Topic</Label>
                  <Input
                    id="primary_beat"
                    name="primary_beat"
                    defaultValue={contact?.primary_beat ?? ""}
                    placeholder="Housing, Public Safety"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primary_city">Primary City</Label>
                  <Input
                    id="primary_city"
                    name="primary_city"
                    defaultValue={contact?.primary_city ?? "San Francisco"}
                    placeholder="San Francisco"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coverage_cities">Additional Cities (comma-separated)</Label>
                  <Input
                    id="coverage_cities"
                    name="coverage_cities"
                    defaultValue={contact?.coverage_cities?.join(", ") ?? ""}
                    placeholder="Oakland, Berkeley"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub_geographies">Sub-geographies</Label>
                <Input
                  id="sub_geographies"
                  name="sub_geographies"
                  defaultValue={contact?.sub_geographies?.join(", ") ?? ""}
                  placeholder="D5, Mission, SOMA"
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  name="organization"
                  defaultValue={contact?.organization ?? ""}
                  placeholder="City of Springfield"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  name="department"
                  defaultValue={contact?.department ?? ""}
                  placeholder="Public Works"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contact?.email ?? ""}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={contact?.phone ?? ""}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* City + Jurisdiction row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2" ref={cityRef}>
              <Label htmlFor="city_search">City</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="city_search"
                  value={cityQuery}
                  onChange={(e) => {
                    setCityQuery(e.target.value)
                    if (cityId) setCityId(null)
                  }}
                  onFocus={() => setShowCityDropdown(true)}
                  placeholder="Search cities..."
                  className="pl-9"
                  autoComplete="off"
                />
                {cityId && (
                  <button
                    type="button"
                    onClick={clearCity}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {showCityDropdown && (cityResults.length > 0 || !cityQuery) && (
                  <div className="absolute z-50 w-full mt-1 bg-white rounded-md border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {!cityQuery && PINNED_CITIES.map((city) => (
                      <button
                        key={`pinned-${city.id}`}
                        type="button"
                        onClick={() => selectCity(city)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center gap-2"
                      >
                        <MapPin className="w-3 h-3 text-purple-500 shrink-0" />
                        <span className="font-medium">{city.name}{city.state ? `, ${city.state}` : ""}</span>
                      </button>
                    ))}
                    {cityResults.filter((c) => !PINNED_CITIES.some((p) => p.id === c.id)).map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => selectCity(city)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        <span>{city.name}{city.state ? `, ${city.state}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {cityId && <p className="text-xs text-green-600">Linked to city #{cityId}</p>}
              {!cityId && cityQuery.length > 0 && (
                <p className="text-xs text-amber-600">Select a city from the list to enable anomaly matching</p>
              )}
            </div>
            {!isMedia && (
              <div className="space-y-2">
                <Label htmlFor="jurisdiction">Jurisdiction / District</Label>
                <Input
                  id="jurisdiction"
                  name="jurisdiction"
                  defaultValue={contact?.jurisdiction ?? ""}
                  placeholder="District 5"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue={String(contact?.priority ?? 3)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Critical</SelectItem>
                  <SelectItem value="2">2 - High</SelectItem>
                  <SelectItem value="3">3 - Medium</SelectItem>
                  <SelectItem value="4">4 - Low</SelectItem>
                  <SelectItem value="5">5 - Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={contact?.status ?? "active"}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Keywords</Label>
            <div className="flex flex-wrap gap-2 p-3 border border-[var(--border-primary)] rounded-md min-h-[60px] bg-[var(--bg-secondary)]">
              {selectedKeywords.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No keywords selected</p>
              ) : (
                selectedKeywords.map((keywordId) => {
                  const keyword = keywords.find((k) => k.id === keywordId)
                  return keyword ? (
                    <Badge
                      key={keyword.id}
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer hover:bg-[var(--bg-tertiary)]"
                      onClick={() => toggleKeyword(keyword.id)}
                    >
                      {keyword.name}
                      <X className="w-3 h-3" />
                    </Badge>
                  ) : null
                })
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {keywords
                .filter((k) => !selectedKeywords.includes(k.id))
                .map((keyword) => (
                  <Badge
                    key={keyword.id}
                    variant="outline"
                    className="cursor-pointer hover:bg-[var(--brand-primary)]/10 hover:border-[var(--brand-primary)]/30 hover:text-[var(--brand-primary)]"
                    onClick={() => toggleKeyword(keyword.id)}
                  >
                    + {keyword.name}
                  </Badge>
                ))}
            </div>
          </div>

          {isMedia && (
            <div className="space-y-2">
              <Label htmlFor="article_urls">Article Links (one URL per line)</Label>
              <Textarea
                id="article_urls"
                name="article_urls"
                defaultValue={articleUrls}
                placeholder="https://example.com/story-1"
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={contact?.notes ?? ""}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-[120px]">
              {isPending ? "Saving..." : contact ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
