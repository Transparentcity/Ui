"use client"

import { useState, useTransition, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Contact, Keyword } from "@/lib/types"
import { ContactDialog } from "./contact-dialog"
import { ContactImportDialog } from "./contact-import-dialog"
import {
  MoreHorizontal,
  Search,
  Mail,
  Phone,
  Trash2,
  Pencil,
  MapPin,
  Loader2,
  ExternalLink,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react"
import { deleteContact, bulkUpdateCity } from "@/app/actions/contacts"
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient"

const PINNED_CITIES: PublicCitySearchResult[] = [
  { id: 1, name: "San Francisco", state: "CA", display_name: "San Francisco" },
]

function getArticleLabel(url: string, title: string | null): string {
  if (title?.trim()) return title
  try {
    return new URL(url).hostname
  } catch {
    return "Link"
  }
}

interface ContactWithKeywords extends Omit<Contact, "article_links"> {
  keywords?: Keyword[]
  article_links?: Array<{ id: string; url: string; title?: string | null }>
}

interface ContactsTableProps {
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
  /** Initial type filter from URL (e.g. ?type=media) */
  initialTypeFilter?: TypeFilter
}

type TypeFilter = "all" | "elected_official" | "city_staff" | "media" | "academic" | "nonprofit" | "lobbyist" | "community_leader"

type SortKey = "name" | "type" | "city" | "district" | "email" | "keywords" | "articles"
type SortDir = "asc" | "desc"

function getPriorityLabel(priority: number) {
  const labels = ["", "Critical", "High", "Medium", "Low", "Minimal"]
  return labels[priority] || "Medium"
}

function getPriorityColor(priority: number) {
  if (priority <= 2) return "bg-destructive/10 text-destructive border-destructive/20"
  if (priority === 3) return "bg-warning/10 text-warning-foreground border-warning/20"
  return "bg-muted text-muted-foreground border-muted"
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-success/10 text-success border-success/20"
    case "inactive":
      return "bg-muted text-muted-foreground border-muted"
    case "unsubscribed":
      return "bg-destructive/10 text-destructive border-destructive/20"
    default:
      return "bg-muted text-muted-foreground border-muted"
  }
}

const CONTACT_TYPE_LABELS: Record<string, string> = {
  elected_official: 'Elected Official',
  city_staff: 'City Staff',
  media: 'Press',
  academic: 'Academic',
  nonprofit: 'Nonprofit',
  lobbyist: 'Lobbyist',
  community_leader: 'Community Leader',
}

function getContactTypeColor(type: string) {
  switch (type) {
    case 'elected_official': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'city_staff': return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'media': return 'bg-pink-100 text-pink-800 border-pink-200'
    case 'academic': return 'bg-cyan-100 text-cyan-800 border-cyan-200'
    case 'nonprofit': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'lobbyist': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'community_leader': return 'bg-violet-100 text-violet-800 border-violet-200'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

export function ContactsTable({ contacts, keywords, initialTypeFilter }: ContactsTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialTypeFilter ?? "all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [citySearch, setCitySearch] = useState("")
  const [cityResults, setCityResults] = useState<PublicCitySearchResult[]>([])
  const [citySearching, setCitySearching] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filteredContacts = contacts.filter((contact) => {
    if (typeFilter !== "all" && (contact.contact_type as string) !== typeFilter) return false
    const search = searchQuery.toLowerCase()
    const c = contact as ContactWithKeywords
    return (
      c.name.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search) ||
      c.organization?.toLowerCase().includes(search) ||
      c.department?.toLowerCase().includes(search) ||
      c.jurisdiction?.toLowerCase().includes(search) ||
      (c.city_name ?? "").toLowerCase().includes(search) ||
      (c.outlet_platform ?? "").toLowerCase().includes(search) ||
      (c.primary_city ?? "").toLowerCase().includes(search) ||
      (c.primary_beat ?? "").toLowerCase().includes(search) ||
      (c.contact_type && CONTACT_TYPE_LABELS[c.contact_type as string]?.toLowerCase().includes(search)) ||
      c.keywords?.some((k) => k.name.toLowerCase().includes(search))
    )
  })

  const sortedContacts = sortKey
    ? [...filteredContacts].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1
        const str = (v: string | null | undefined) => (v ?? "").toLowerCase()
        switch (sortKey) {
          case "name": return dir * str(a.name).localeCompare(str(b.name))
          case "type": return dir * str(CONTACT_TYPE_LABELS[(a.contact_type as string) ?? ""] ?? a.contact_type as string).localeCompare(str(CONTACT_TYPE_LABELS[(b.contact_type as string) ?? ""] ?? b.contact_type as string))
          case "city": return dir * str(a.city_name).localeCompare(str(b.city_name))
          case "district": {
            const aVal = (a.contact_type as string) === "media" ? a.outlet_platform : a.jurisdiction
            const bVal = (b.contact_type as string) === "media" ? b.outlet_platform : b.jurisdiction
            return dir * str(aVal).localeCompare(str(bVal))
          }
          case "email": return dir * str(a.email).localeCompare(str(b.email))
          case "keywords": return dir * ((a.keywords?.length ?? 0) - (b.keywords?.length ?? 0))
          case "articles": return dir * (((a as ContactWithKeywords).article_links?.length ?? 0) - ((b as ContactWithKeywords).article_links?.length ?? 0))
          default: return 0
        }
      })
    : filteredContacts

  const allSelected = sortedContacts.length > 0 && sortedContacts.every(c => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedContacts.map(c => c.id)))
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // City search with debounce
  useEffect(() => {
    if (!citySearch || citySearch.length < 2) {
      setCityResults([])
      return
    }
    const timer = setTimeout(async () => {
      setCitySearching(true)
      try {
        const results = await searchPublicCities(citySearch, 8)
        setCityResults(results)
      } catch {
        setCityResults([])
      } finally {
        setCitySearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [citySearch])

  const handleBulkAssignCity = useCallback((city: PublicCitySearchResult) => {
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await bulkUpdateCity(ids, city.id, city.display_name || city.name)
      setBulkMessage(`Assigned "${city.display_name || city.name}" to ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setShowCityPicker(false)
      setCitySearch("")
      router.refresh()
      setTimeout(() => setBulkMessage(null), 4000)
    })
  }, [selectedIds, router])

  const handleBulkClearCity = useCallback(() => {
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      const result = await bulkUpdateCity(ids, null, null)
      setBulkMessage(`Cleared city from ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setShowCityPicker(false)
      router.refresh()
      setTimeout(() => setBulkMessage(null), 4000)
    })
  }, [selectedIds, router])

  const cityBreakdown = contacts.reduce<Record<string, number>>((acc, c) => {
    const key = c.city_name || (c.city_id ? `City #${c.city_id}` : 'No city')
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const handleExportCsv = useCallback(() => {
    const headers = [
      "Name", "Email", "Phone", "Title", "Organization", "Department",
      "Contact Type", "City", "Jurisdiction", "Priority", "Status",
      "Notes", "Keywords", "Created", "Updated",
      "Outlet/Platform", "Primary Beat", "Primary City",
    ]

    const escapeCsv = (value: string | null | undefined): string => {
      if (value == null) return ""
      const str = String(value)
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = filteredContacts.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.title,
      c.organization,
      c.department,
      c.contact_type ? (CONTACT_TYPE_LABELS[c.contact_type as string] || c.contact_type) : "",
      c.city_name,
      c.jurisdiction,
      getPriorityLabel(c.priority),
      c.status,
      c.notes,
      c.keywords?.map((k) => k.name).join("; "),
      c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
      c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "",
      c.outlet_platform,
      c.primary_beat,
      c.primary_city,
    ])

    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredContacts])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="elected_official">Elected Official</SelectItem>
            <SelectItem value="city_staff">City Staff</SelectItem>
            <SelectItem value="media">Press</SelectItem>
            <SelectItem value="academic">Academic</SelectItem>
            <SelectItem value="nonprofit">Nonprofit</SelectItem>
            <SelectItem value="lobbyist">Lobbyist</SelectItem>
            <SelectItem value="community_leader">Community Leader</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? "s" : ""}
        </p>
        <ContactImportDialog keywords={keywords}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
        </ContactImportDialog>
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
        {/* City breakdown badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.entries(cityBreakdown).map(([city, count]) => (
            <Badge
              key={city}
              variant="outline"
              className={`text-xs ${city === 'No city' ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}`}
            >
              <MapPin className="w-3 h-3 mr-1" />
              {city}: {count}
            </Badge>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 border border-purple-200">
          <span className="text-sm font-medium text-purple-800">
            {selectedIds.size} selected
          </span>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCityPicker(!showCityPicker)}
              disabled={isPending}
              className="gap-1.5 text-xs"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
              Assign City
            </Button>
            {showCityPicker && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border z-50 p-2">
                {/* Pinned cities for quick selection */}
                {PINNED_CITIES.map((city) => (
                  <button
                    key={`pinned-${city.id}`}
                    onClick={() => handleBulkAssignCity(city)}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-purple-50 transition-colors flex items-center gap-2"
                  >
                    <MapPin className="w-3 h-3 text-purple-500 shrink-0" />
                    <span className="font-medium">{city.name}</span>
                    {city.state && <span className="text-gray-500">{city.state}</span>}
                  </button>
                ))}
                <div className="border-t my-1 pt-1">
                  <Input
                    placeholder="Search other cities..."
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    className="mb-2"
                    autoFocus
                  />
                </div>
                {citySearching && (
                  <div className="flex items-center gap-2 p-2 text-sm text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Searching...
                  </div>
                )}
                {cityResults.filter(c => !PINNED_CITIES.some(p => p.id === c.id)).map((city) => (
                  <button
                    key={city.id}
                    onClick={() => handleBulkAssignCity(city)}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-purple-50 transition-colors"
                  >
                    <span className="font-medium">{city.name}</span>
                    {city.state && <span className="text-gray-500 ml-1">{city.state}</span>}
                    <span className="text-xs text-gray-400 ml-2">#{city.id}</span>
                  </button>
                ))}
                {citySearch.length >= 2 && !citySearching && cityResults.length === 0 && (
                  <p className="text-sm text-gray-500 p-2">No cities found</p>
                )}
                <div className="border-t mt-1 pt-1">
                  <button
                    onClick={handleBulkClearCity}
                    className="w-full text-left px-3 py-2 text-sm rounded text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Clear city assignment
                  </button>
                </div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedIds(new Set()); setShowCityPicker(false) }}
            className="text-xs text-gray-500"
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Success message */}
      {bulkMessage && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          {bulkMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                {([
                  ["type", "Type"],
                  ["name", "Name"],
                  ["city", "City"],
                  ["district", "District / Outlet"],
                  ["email", "Contact Info"],
                  ["keywords", "Keywords"],
                  ["articles", "Articles"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <TableHead key={key}>
                    <button
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortKey === key ? (
                        sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {searchQuery || typeFilter !== "all"
                      ? "No contacts found"
                      : "No contacts yet. Add your first contact to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                sortedContacts.map((contact) => {
                  const isMedia = (contact.contact_type as string) === "media"
                  return (
                    <TableRow
                      key={contact.id}
                      className={selectedIds.has(contact.id) ? "bg-purple-50/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={() => toggleOne(contact.id)}
                        />
                      </TableCell>
                      <TableCell>
                        {contact.contact_type ? (
                          <Badge variant="outline" className={`text-xs ${getContactTypeColor(contact.contact_type as string)}`}>
                            {CONTACT_TYPE_LABELS[contact.contact_type as string] || contact.contact_type}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          {contact.title && (
                            <p className="text-xs text-muted-foreground">{contact.title}</p>
                          )}
                          {isMedia && contact.primary_beat && (
                            <p className="text-xs text-muted-foreground">{contact.primary_beat}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.city_name ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span className="text-sm">{contact.city_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          {isMedia ? (
                            <>
                              <p className="text-sm font-medium">
                                {contact.outlet_platform || "-"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {contact.primary_city || ""}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium">
                                {contact.jurisdiction || "-"}
                              </p>
                              {contact.organization && (
                                <p className="text-xs text-muted-foreground">
                                  {contact.organization}
                                </p>
                              )}
                              {contact.department && (
                                <p className="text-xs text-muted-foreground">
                                  {contact.department}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Mail className="w-3 h-3" />
                              {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </a>
                          )}
                          {!contact.email && !contact.phone && (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-48">
                          {contact.keywords?.length ? (
                            contact.keywords.slice(0, 3).map((k) => (
                              <Badge key={k.id} variant="outline" className="text-xs">
                                {k.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                          {(contact.keywords?.length ?? 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(contact.keywords?.length ?? 0) - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 max-w-40">
                          {(contact as ContactWithKeywords).article_links?.length ? (
                            (contact as ContactWithKeywords).article_links!.slice(0, 2).map(
                              (a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  {getArticleLabel(a.url, a.title ?? null)}
                                </a>
                              )
                            )
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                          {((contact as ContactWithKeywords).article_links?.length ?? 0) > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +
                              {((contact as ContactWithKeywords).article_links?.length ?? 0) - 2}{" "}
                              more
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <ContactDialog contact={contact} keywords={keywords}>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            </ContactDialog>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={async () => {
                                if (
                                  confirm("Are you sure you want to delete this contact?")
                                ) {
                                  await deleteContact(contact.id)
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
