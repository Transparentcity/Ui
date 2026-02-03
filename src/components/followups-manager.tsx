"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Calendar, AlertCircle, CheckCircle2, FileText, Plus, MoreVertical, Copy, Trash2, Edit } from "lucide-react"
import { Followup, Template } from "@/lib/types"
import { FollowupDialog } from "./followup-dialog"
import { TemplateDialog } from "./template-dialog"
import { updateFollowupStatus } from "@/app/actions/followups"
import { deleteTemplate, duplicateTemplate } from "@/app/actions/templates"

interface FollowupWithRelations extends Followup {
  contact?: { id: string; name: string; organization: string | null; email: string | null } | null
  response?: { id: string; content: string | null; sentiment: string | null } | null
}

interface Contact {
  id: string
  name: string
  organization: string | null
}

interface FollowupsManagerProps {
  followups: FollowupWithRelations[]
  contacts: Contact[]
  templates?: Template[]
}

function getPriorityColor(priority: number) {
  if (priority <= 2) return 'bg-destructive/10 text-destructive border-destructive/20'
  if (priority === 3) return 'bg-warning/10 text-warning-foreground border-warning/20'
  return 'bg-muted text-muted-foreground border-muted'
}

export function FollowupsManager({ followups, contacts, templates = [] }: FollowupsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [templateSearchQuery, setTemplateSearchQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Filter templates for "Follow-up" or "Reply" categories, or show all if none match
  const followupTemplates = templates.filter(t => 
    t.category?.toLowerCase().includes('follow') || 
    t.category?.toLowerCase().includes('reply') ||
    !t.category
  )
  
  const filteredTemplates = followupTemplates.filter(template =>
    template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    template.body.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    template.category?.toLowerCase().includes(templateSearchQuery.toLowerCase())
  )

  const handleDeleteTemplate = async (id: string) => {
    setIsDeleting(id)
    startTransition(async () => {
      await deleteTemplate(id)
      setIsDeleting(null)
    })
  }

  const handleDuplicateTemplate = (id: string) => {
    startTransition(async () => {
      await duplicateTemplate(id)
    })
  }

  const now = new Date()
  
  const filteredFollowups = followups.filter(followup => {
    const matchesSearch = 
      followup.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      followup.contact?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      followup.description?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || followup.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const overdueFollowups = filteredFollowups.filter(f => 
    f.status === 'pending' && new Date(f.due_date) < now
  )
  const todayFollowups = filteredFollowups.filter(f => {
    if (f.status !== 'pending') return false
    const dueDate = new Date(f.due_date)
    return dueDate.toDateString() === now.toDateString()
  })
  const upcomingFollowups = filteredFollowups.filter(f => {
    if (f.status !== 'pending') return false
    const dueDate = new Date(f.due_date)
    return dueDate > now && dueDate.toDateString() !== now.toDateString()
  })
  const completedFollowups = filteredFollowups.filter(f => f.status === 'completed')

  const handleComplete = async (id: string) => {
    startTransition(async () => {
      await updateFollowupStatus(id, 'completed')
    })
  }

  const FollowupCard = ({ followup, isOverdue = false }: { followup: FollowupWithRelations; isOverdue?: boolean }) => (
    <Card className={isOverdue ? 'border-destructive/50' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={followup.status === 'completed'}
            onCheckedChange={() => handleComplete(followup.id)}
            disabled={isPending || followup.status === 'completed'}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <FollowupDialog followup={followup} contacts={contacts} templates={templates}>
                <button className="font-medium text-left hover:underline">
                  {followup.title}
                </button>
              </FollowupDialog>
              <Badge variant="outline" className={getPriorityColor(followup.priority)}>
                P{followup.priority}
              </Badge>
              {isOverdue && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Overdue
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {followup.contact?.name} {followup.contact?.organization ? `• ${followup.contact.organization}` : ''}
            </p>
            {followup.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {followup.description}
              </p>
            )}
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {new Date(followup.due_date).toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const TemplateCard = ({ template }: { template: Template }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <TemplateDialog template={template}>
                <button className="font-medium text-left hover:underline">
                  {template.name}
                </button>
              </TemplateDialog>
              {template.category && (
                <Badge variant="secondary" className="text-xs">
                  {template.category}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {template.channel}
              </Badge>
            </div>
            {template.subject && (
              <p className="text-sm text-muted-foreground mb-1">
                Subject: {template.subject}
              </p>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">
              {template.body}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Updated {new Date(template.updated_at).toLocaleDateString()}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <TemplateDialog template={template}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </TemplateDialog>
              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template.id)}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDeleteTemplate(template.id)}
                className="text-destructive"
                disabled={isDeleting === template.id}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting === template.id ? 'Deleting...' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Tabs defaultValue="followups" className="space-y-6">
      <TabsList>
        <TabsTrigger value="followups" className="gap-2">
          <Calendar className="w-4 h-4" />
          Follow-ups
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-2">
          <FileText className="w-4 h-4" />
          Reply Templates
        </TabsTrigger>
      </TabsList>

      <TabsContent value="followups" className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-64 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search follow-ups..."
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
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {filteredFollowups.length} follow-up{filteredFollowups.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filteredFollowups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchQuery || statusFilter !== 'pending'
                ? 'No follow-ups found matching your filters' 
                : 'No pending follow-ups. Schedule follow-ups to stay on top of your outreach.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {overdueFollowups.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-destructive mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Overdue ({overdueFollowups.length})
                </h3>
                <div className="space-y-2">
                  {overdueFollowups.map(followup => (
                    <FollowupCard key={followup.id} followup={followup} isOverdue />
                  ))}
                </div>
              </div>
            )}

            {todayFollowups.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Today ({todayFollowups.length})
                </h3>
                <div className="space-y-2">
                  {todayFollowups.map(followup => (
                    <FollowupCard key={followup.id} followup={followup} />
                  ))}
                </div>
              </div>
            )}

            {upcomingFollowups.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Upcoming ({upcomingFollowups.length})
                </h3>
                <div className="space-y-2">
                  {upcomingFollowups.map(followup => (
                    <FollowupCard key={followup.id} followup={followup} />
                  ))}
                </div>
              </div>
            )}

            {statusFilter === 'all' && completedFollowups.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed ({completedFollowups.length})
                </h3>
                <div className="space-y-2 opacity-60">
                  {completedFollowups.map(followup => (
                    <FollowupCard key={followup.id} followup={followup} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      <TabsContent value="templates" className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-64 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={templateSearchQuery}
              onChange={(e) => setTemplateSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <TemplateDialog>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </TemplateDialog>
          <p className="text-sm text-muted-foreground">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">
                {templateSearchQuery
                  ? 'No templates found matching your search' 
                  : 'No reply templates yet'}
              </p>
              <p className="text-sm mb-4">
                Create templates to quickly respond to follow-ups with consistent messaging.
              </p>
              {!templateSearchQuery && (
                <TemplateDialog>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Template
                  </Button>
                </TemplateDialog>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map(template => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
