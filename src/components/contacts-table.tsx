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
import { Card, CardContent } from "@/components/ui/card"
import { Contact, Keyword } from "@/lib/types"
import { ContactDialog } from "./contact-dialog"
import {
  MoreHorizontal,
  Search,
  Mail,
  Phone,
  Trash2,
  Pencil,
  MapPin,
  Loader2,
} from "lucide-react"
import { deleteContact, bulkUpdateCity } from "@/app/actions/contacts"
import { searchPublicCities, type PublicCitySearchResult } from "@/lib/publicApiClient"

// Pinned cities that appear at the top of the city picker for quick selection
const PINNED_CITIES: PublicCitySearchResult[] = [
  { id: 1, name: "San Francisco", state: "CA", display_name: "San Francisco" },
]

interface ContactWithKeywords extends Contact {
  keywords: Keyword[]
}

interface ContactsTableProps {
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
}

function getPriorityLabel(priority: number) {
  const labels = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal']
  return labels[priority] || 'Medium'
}

function getPriorityColor(priority: number) {
  if (priority <= 2) return 'bg-destructive/10 text-destructive border-destructive/20'
  if (priority === 3) return 'bg-warning/10 text-warning-foreground border-warning/20'
  return 'bg-muted text-muted-foreground border-muted'
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-success/10 text-success border-success/20'
    case 'inactive': return 'bg-muted text-muted-foreground border-muted'
    case 'unsubscribed': return 'bg-destructive/10 text-destructive border-destructive/20'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

export function ContactsTable({ contacts, keywords }: ContactsTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  // Bulk city assignment state
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [citySearch, setCitySearch] = useState("")
  const [cityResults, setCityResults] = useState<PublicCitySearchResult[]>([])
  const [citySearching, setCitySearching] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)

  const filteredContacts = contacts.filter(contact => {
    const search = searchQuery.toLowerCase()
    return (
      contact.name.toLowerCase().includes(search) ||
      contact.email?.toLowerCase().includes(search) ||
      contact.organization?.toLowerCase().includes(search) ||
      contact.department?.toLowerCase().includes(search) ||
      contact.jurisdiction?.toLowerCase().includes(search) ||
      contact.city_name?.toLowerCase().includes(search) ||
      contact.keywords?.some(k => k.name.toLowerCase().includes(search))
    )
  })

  const allSelected = filteredContacts.length > 0 && filteredContacts.every(c => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)))
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

  return (
    <div className="space-y-4">
      {/* Top bar: search + bulk actions + city stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
        </p>
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
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {searchQuery ? 'No contacts found matching your search' : 'No contacts yet. Add your first contact to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((contact) => (
                  <TableRow key={contact.id} className={selectedIds.has(contact.id) ? 'bg-purple-50/50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleOne(contact.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
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
                        <p className="text-sm font-medium">{contact.jurisdiction || '-'}</p>
                        {contact.organization && (
                          <p className="text-xs text-muted-foreground">{contact.organization}</p>
                        )}
                        {contact.department && (
                          <p className="text-xs text-muted-foreground">{contact.department}</p>
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
                        {contact.keywords?.length > 0 ? (
                          contact.keywords.slice(0, 3).map((keyword) => (
                            <Badge key={keyword.id} variant="outline" className="text-xs">
                              {keyword.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                        {contact.keywords?.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{contact.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(contact.priority)}>
                        {getPriorityLabel(contact.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(contact.status)}>
                        {contact.status}
                      </Badge>
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
                              if (confirm('Are you sure you want to delete this contact?')) {
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
