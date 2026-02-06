"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Mail, MessageSquare, Pencil, Trash2, Copy, Shuffle, Wand2 } from "lucide-react"
import type { Template, TemplateWithVariations } from "@/lib/types"
import { deleteTemplate, duplicateTemplate } from "@/app/actions/templates"
import { TemplateDialog } from "./template-dialog"
import { DynamicTemplateEditor } from "./dynamic-template-editor"
import { toneProfiles } from "@/app/data/tone-profiles"
import { sampleContact } from "@/app/data/sample-contact"
import { hasVariations, getVariationCount } from "@/lib/utils" // Import the undeclared variables

interface TemplatesManagerProps {
  templates: Template[]
}

export function TemplatesManager({ templates }: TemplatesManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const emailTemplates = filteredTemplates.filter(t => t.channel === 'email')
  const smsTemplates = filteredTemplates.filter(t => t.channel === 'sms')

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      startTransition(async () => {
        await deleteTemplate(id)
      })
    }
  }

  const handleDuplicate = async (id: string) => {
    startTransition(async () => {
      await duplicateTemplate(id)
    })
  }

  const TemplateCard = ({ template }: { template: Template }) => (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {template.channel === 'email' ? (
                <Mail className="w-4 h-4 text-muted-foreground" />
              ) : (
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
              )}
              <CardTitle className="text-base truncate">{template.name}</CardTitle>
            </div>
            {template.category && (
              <Badge variant="outline" className="text-xs">
                {template.category}
              </Badge>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <TemplateDialog template={template}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </TemplateDialog>
              <DropdownMenuItem onClick={() => handleDuplicate(template.id)} disabled={isPending}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => handleDelete(template.id)}
                disabled={isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {template.subject && (
          <p className="text-sm font-medium mb-2 text-muted-foreground">
            Subject: {template.subject}
          </p>
        )}
        <p className="text-sm text-muted-foreground line-clamp-3">
          {template.body}
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          Updated {new Date(template.updated_at).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
        </p>
      </div>

      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery 
              ? 'No templates found matching your search' 
              : 'No templates yet. Create your first template to start building outreach campaigns.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {emailTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Templates ({emailTemplates.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {emailTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}

          {smsTemplates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                SMS Templates ({smsTemplates.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {smsTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
