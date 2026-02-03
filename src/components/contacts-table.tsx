"use client"

import { useState } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Contact, Keyword } from "@/lib/types"
import { ContactDialog } from "./contact-dialog"
import { MoreHorizontal, Search, Mail, Phone, Trash2, Pencil } from "lucide-react"
import { deleteContact } from "@/app/actions/contacts"

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
  const [searchQuery, setSearchQuery] = useState("")

  const filteredContacts = contacts.filter(contact => {
    const search = searchQuery.toLowerCase()
    return (
      contact.name.toLowerCase().includes(search) ||
      contact.email?.toLowerCase().includes(search) ||
      contact.organization?.toLowerCase().includes(search) ||
      contact.department?.toLowerCase().includes(search) ||
      contact.jurisdiction?.toLowerCase().includes(search) ||
      contact.keywords?.some(k => k.name.toLowerCase().includes(search))
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
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
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
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
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {searchQuery ? 'No contacts found matching your search' : 'No contacts yet. Add your first contact to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        {contact.title && (
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
                        )}
                      </div>
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
