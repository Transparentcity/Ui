"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, CheckCircle, Clock, Archive, Trash2, CalendarPlus } from "lucide-react"
import { Response } from "@/lib/types"
import { ResponseDialog } from "./response-dialog"
import { updateResponseStatus, deleteResponse } from "@/app/actions/responses"
import { FollowupDialog } from "./followup-dialog"

interface ResponseWithRelations extends Response {
  contact?: { id: string; name: string; organization: string | null; email: string | null } | null
  message?: { id: string; subject: string | null; channel: string } | null
}

interface Contact {
  id: string
  name: string
  organization: string | null
}

interface ResponsesManagerProps {
  responses: ResponseWithRelations[]
  contacts: Contact[]
}

function getSentimentColor(sentiment: string | null) {
  switch (sentiment) {
    case 'positive': return 'bg-success/10 text-success border-success/20'
    case 'negative': return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'needs_followup': return 'bg-warning/10 text-warning-foreground border-warning/20'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'new': return 'bg-primary/10 text-primary border-primary/20'
    case 'reviewed': return 'bg-accent/10 text-accent-foreground border-accent/20'
    case 'actioned': return 'bg-success/10 text-success border-success/20'
    case 'archived': return 'bg-muted text-muted-foreground border-muted'
    default: return 'bg-muted text-muted-foreground border-muted'
  }
}

function getPriorityLabel(priority: number) {
  const labels = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal']
  return labels[priority] || 'Medium'
}

export function ResponsesManager({ responses, contacts }: ResponsesManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sentimentFilter, setSentimentFilter] = useState<string>("all")
  const [isPending, startTransition] = useTransition()

  const filteredResponses = responses.filter(response => {
    const matchesSearch = 
      response.contact?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.contact?.organization?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      response.content?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || response.status === statusFilter
    const matchesSentiment = sentimentFilter === 'all' || response.sentiment === sentimentFilter
    
    return matchesSearch && matchesStatus && matchesSentiment
  })

  const handleStatusChange = async (id: string, status: string) => {
    startTransition(async () => {
      await updateResponseStatus(id, status)
    })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this response?')) {
      startTransition(async () => {
        await deleteResponse(id)
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-64 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search responses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="actioned">Actioned</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filteredResponses.length} response{filteredResponses.length !== 1 ? 's' : ''}
        </p>
      </div>

      {filteredResponses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery || statusFilter !== 'all' || sentimentFilter !== 'all'
              ? 'No responses found matching your filters' 
              : 'No responses yet. Log responses from officials to track engagement.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredResponses.map((response) => (
            <Card key={response.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium">{response.contact?.name || 'Unknown Contact'}</h3>
                      <Badge variant="outline" className={getStatusColor(response.status)}>
                        {response.status}
                      </Badge>
                      <Badge variant="outline" className={getSentimentColor(response.sentiment)}>
                        {response.sentiment || 'pending'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        P{response.priority} - {getPriorityLabel(response.priority)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {response.contact?.organization} • {response.channel} • {new Date(response.responded_at).toLocaleDateString()}
                    </p>
                    {response.content && (
                      <p className="text-sm bg-muted/30 p-3 rounded-md">
                        {response.content}
                      </p>
                    )}
                    {response.action_notes && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Notes: {response.action_notes}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {response.status === 'new' && (
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(response.id, 'reviewed')}
                          disabled={isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Reviewed
                        </DropdownMenuItem>
                      )}
                      {response.status === 'reviewed' && (
                        <DropdownMenuItem 
                          onClick={() => handleStatusChange(response.id, 'actioned')}
                          disabled={isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Mark Actioned
                        </DropdownMenuItem>
                      )}
                      <FollowupDialog 
                        contactId={response.contact?.id || ''} 
                        responseId={response.id}
                        contactName={response.contact?.name || 'Unknown'}
                      >
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <CalendarPlus className="w-4 h-4 mr-2" />
                          Schedule Follow-up
                        </DropdownMenuItem>
                      </FollowupDialog>
                      <ResponseDialog response={response} contacts={contacts}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Clock className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      </ResponseDialog>
                      <DropdownMenuItem 
                        onClick={() => handleStatusChange(response.id, 'archived')}
                        disabled={isPending}
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => handleDelete(response.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
