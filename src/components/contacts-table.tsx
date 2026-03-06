"use client"

import { useState, useTransition, useCallback, useEffect, useMemo, useRef } from "react"
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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
  Tag,
  Users,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Sparkles,
  History,
} from "lucide-react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { deleteContact, bulkUpdateCity, bulkAddKeywords, bulkUpdateType } from "@/app/actions/contacts"
import { ContactActivityTimeline } from "./contact-activity-timeline"
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient"
import { toast } from "sonner"

const PINNED_CITIES: PublicCitySearchResult[] = [
  { id: 57260, name: "San Francisco", state: "CA", display_name: "San Francisco" },
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
  draftCounts?: { pending: number; sent: number }
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
  const [showKeywordPicker, setShowKeywordPicker] = useState(false)
  const [keywordSearch, setKeywordSearch] = useState("")
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set())
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [cityFilter, setCityFilter] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 25

  // Debounced search for filtering (Phase 4)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filteredContacts = useMemo(() => contacts.filter((contact) => {
    if (typeFilter !== "all" && (contact.contact_type as string) !== typeFilter) return false
    if (cityFilter) {
      const contactCity = contact.city_name || (contact.city_id ? `City #${contact.city_id}` : 'No city')
      if (contactCity !== cityFilter) return false
    }
    const search = debouncedSearchQuery.toLowerCase()
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
  }), [contacts, typeFilter, cityFilter, debouncedSearchQuery])

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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedContacts.length / pageSize))
  const paginatedContacts = useMemo(
    () => sortedContacts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedContacts, currentPage, pageSize]
  )

  // Reset page on filter/search/sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery, typeFilter, cityFilter, sortKey, sortDir])

  const allSelected = paginatedContacts.length > 0 && paginatedContacts.every(c => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedContacts.map(c => c.id)))
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
      try {
        const result = await bulkUpdateCity(ids, city.id, city.display_name || city.name)
        toast.success(`Assigned "${city.display_name || city.name}" to ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
        setSelectedIds(new Set())
        setShowCityPicker(false)
        setCitySearch("")
        router.refresh()
      } catch (err) {
        toast.error("Failed to assign city")
      }
    })
  }, [selectedIds, router])

  const handleBulkClearCity = useCallback(() => {
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      try {
        const result = await bulkUpdateCity(ids, null, null)
        toast.success(`Cleared city from ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
        setSelectedIds(new Set())
        setShowCityPicker(false)
        router.refresh()
      } catch (err) {
        toast.error("Failed to clear city")
      }
    })
  }, [selectedIds, router])

  const handleBulkAssignKeywords = useCallback(() => {
    if (selectedKeywordIds.size === 0) return
    const ids = Array.from(selectedIds)
    const kwIds = Array.from(selectedKeywordIds)
    startTransition(async () => {
      try {
        const result = await bulkAddKeywords(ids, kwIds)
        toast.success(`Added ${kwIds.length} keyword${kwIds.length !== 1 ? 's' : ''} to ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
        setSelectedIds(new Set())
        setShowKeywordPicker(false)
        setSelectedKeywordIds(new Set())
        setKeywordSearch("")
        router.refresh()
      } catch (err) {
        toast.error("Failed to assign keywords")
      }
    })
  }, [selectedIds, selectedKeywordIds, router])

  const handleBulkAssignType = useCallback((type: string) => {
    const ids = Array.from(selectedIds)
    startTransition(async () => {
      try {
        const result = await bulkUpdateType(ids, type)
        const label = CONTACT_TYPE_LABELS[type] || type
        toast.success(`Set type to "${label}" for ${result.updated} contact${result.updated !== 1 ? 's' : ''}`)
        setSelectedIds(new Set())
        setShowTypePicker(false)
        router.refresh()
      } catch (err) {
        toast.error("Failed to assign type")
      }
    })
  }, [selectedIds, router])

  const filteredKeywords = keywords.filter((k) =>
    k.name.toLowerCase().includes(keywordSearch.toLowerCase())
  )

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
    toast.success("CSV exported")
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
              className={`text-xs cursor-pointer transition-all ${
                cityFilter === city
                  ? 'ring-2 ring-purple-500'
                  : ''
              } ${city === 'No city' ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}`}
              onClick={() => setCityFilter(prev => prev === city ? null : city)}
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
              onClick={() => { setShowCityPicker(!showCityPicker); setShowKeywordPicker(false); setShowTypePicker(false) }}
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
          {/* Keyword picker */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowKeywordPicker(!showKeywordPicker); setShowCityPicker(false); setShowTypePicker(false) }}
              disabled={isPending}
              className="gap-1.5 text-xs"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
              Assign Keywords
            </Button>
            {showKeywordPicker && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-lg border z-50 p-2 max-h-80 flex flex-col">
                <Input
                  placeholder="Search keywords..."
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  className="mb-2"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 space-y-0.5">
                  {filteredKeywords.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">No keywords found</p>
                  ) : (
                    filteredKeywords.map((kw) => (
                      <label
                        key={kw.id}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-purple-50 transition-colors cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedKeywordIds.has(kw.id)}
                          onCheckedChange={() => {
                            const next = new Set(selectedKeywordIds)
                            if (next.has(kw.id)) next.delete(kw.id)
                            else next.add(kw.id)
                            setSelectedKeywordIds(next)
                          }}
                        />
                        <span>{kw.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedKeywordIds.size > 0 && (
                  <div className="border-t mt-1 pt-2 flex justify-between items-center">
                    <span className="text-xs text-gray-500">{selectedKeywordIds.size} selected</span>
                    <Button size="sm" className="text-xs h-7" onClick={handleBulkAssignKeywords}>
                      Apply
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Type picker */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowTypePicker(!showTypePicker); setShowCityPicker(false); setShowKeywordPicker(false) }}
              disabled={isPending}
              className="gap-1.5 text-xs"
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              Assign Type
            </Button>
            {showTypePicker && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border z-50 p-1">
                {Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => handleBulkAssignType(value)}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-purple-50 transition-colors flex items-center gap-2"
                  >
                    <Badge variant="outline" className={`text-xs ${getContactTypeColor(value)}`}>
                      {label}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedIds(new Set()); setShowCityPicker(false); setShowKeywordPicker(false); setShowTypePicker(false) }}
            className="text-xs text-gray-500"
          >
            Clear selection
          </Button>
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
              {paginatedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {searchQuery || typeFilter !== "all" || cityFilter
                      ? "No contacts found"
                      : "No contacts yet. Add your first contact to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedContacts.map((contact) => {
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
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium">{contact.name}</p>
                            {contact.draftCounts?.pending ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200">
                                {contact.draftCounts.pending} draft{contact.draftCounts.pending !== 1 ? 's' : ''}
                              </Badge>
                            ) : null}
                            {contact.draftCounts?.sent ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-50 text-green-700 border-green-200">
                                {contact.draftCounts.sent} sent
                              </Badge>
                            ) : null}
                          </div>
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <DropdownMenuItem
                                      disabled={!contact.city_id}
                                      onSelect={() => {
                                        router.push(`/compose?contactId=${contact.id}`)
                                      }}
                                    >
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      Generate Draft
                                    </DropdownMenuItem>
                                  </div>
                                </TooltipTrigger>
                                {!contact.city_id && (
                                  <TooltipContent>
                                    <p>Assign a city to enable draft generation</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                            <ContactActivityTimeline contactId={contact.id} contactName={contact.name}>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <History className="w-4 h-4 mr-2" />
                                Activity
                              </DropdownMenuItem>
                            </ContactActivityTimeline>
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={deletingId === contact.id}
                              onSelect={(e) => {
                                e.preventDefault()
                                setDeleteConfirmId(contact.id)
                              }}
                            >
                              {deletingId === contact.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                              )}
                              {deletingId === contact.id ? "Deleting..." : "Delete"}
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

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2" data-testid="pagination-controls">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({sortedContacts.length} contacts)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-gray-900">
                {contacts.find(c => c.id === deleteConfirmId)?.name}
              </span>{" "}
              from your contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={async () => {
                if (!deleteConfirmId) return
                const id = deleteConfirmId
                setDeleteConfirmId(null)
                setDeletingId(id)
                try {
                  await deleteContact(id)
                  toast.success("Contact deleted")
                  router.refresh()
                } catch (err) {
                  toast.error("Failed to delete contact")
                } finally {
                  setDeletingId(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
