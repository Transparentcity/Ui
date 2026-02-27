"use client"

import React from "react"

import { useState, useTransition } from "react"
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
import { Followup, Template } from "@/lib/types"
import { createFollowup, updateFollowup } from "@/app/actions/followups"
import { ReplyTemplateSelector } from "./reply-template-selector"
import { SaveAsTemplateDialog } from "./save-as-template-dialog"

interface Contact {
  id: string
  name: string
  organization: string | null
}

interface FollowupDialogProps {
  followup?: Followup
  contacts?: Contact[]
  contactId?: string
  responseId?: string
  contactName?: string
  templates?: Template[]
  /** Optional controlled open state. */
  open?: boolean
  /** Optional controlled open change handler. */
  onOpenChange?: (open: boolean) => void
  /** When true, do not render a trigger (for programmatic open). */
  hideTrigger?: boolean
  children?: React.ReactNode
}

export function FollowupDialog({ 
  followup, 
  contacts = [], 
  contactId, 
  responseId, 
  contactName,
  templates = [],
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  children 
}: FollowupDialogProps) {
  const isControlled = typeof openProp === "boolean"
  const [openUncontrolled, setOpenUncontrolled] = useState(false)
  const open = isControlled ? (openProp as boolean) : openUncontrolled
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setOpenUncontrolled
  const [isPending, startTransition] = useTransition()
  const [description, setDescription] = useState(followup?.description || "")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()

  const handleTemplateSelect = (template: Template) => {
    setDescription(template.body)
    setSelectedTemplateId(template.id)
  }

  const handleSubmit = async (formData: FormData) => {
    if (contactId) {
      formData.set('prospect_id', contactId)
    }
    if (responseId) {
      formData.set('response_id', responseId)
    }

    startTransition(async () => {
      if (followup) {
        await updateFollowup(followup.id, formData)
      } else {
        await createFollowup(formData)
      }
      setOpen(false)
    })
  }

  // Default to tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const defaultDate = followup?.due_date?.split('T')[0] || tomorrow.toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {followup ? 'Edit Follow-up' : 'Schedule Follow-up'}
            {contactName && !followup && ` with ${contactName}`}
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={followup?.title}
              required
              placeholder="e.g., Follow up on infrastructure data"
            />
          </div>

          {!contactId && contacts.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="contact_id">Contact *</Label>
              <Select name="prospect_id" defaultValue={(followup as any)?.prospect_id || ''} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map(contact => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} {contact.organization ? `(${contact.organization})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date *</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={defaultDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue={String(followup?.priority || 3)}>
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description / Response</Label>
              <div className="flex items-center gap-2">
                {templates.length > 0 && (
                  <ReplyTemplateSelector
                    templates={templates}
                    onSelect={handleTemplateSelect}
                    selectedTemplateId={selectedTemplateId}
                  />
                )}
                {description.trim() && (
                  <SaveAsTemplateDialog
                    content={description}
                    defaultCategory="Follow-up"
                  />
                )}
              </div>
            </div>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setSelectedTemplateId(undefined)
              }}
              placeholder="Details about what to follow up on, or use a template..."
              rows={5}
            />
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Tip: Create reply templates in the Templates section to speed up responses.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : followup ? 'Update Follow-up' : 'Schedule Follow-up'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
