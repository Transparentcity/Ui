"use client"

import React, { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Campaign, Template } from "@/lib/types"
import { createCampaign, updateCampaign } from "@/app/actions/campaigns"

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface CampaignDialogProps {
  campaign?: Campaign & { prospect_ids?: string[] }
  templates: Pick<Template, 'id' | 'name' | 'channel'>[]
  contacts: Contact[]
  children: React.ReactNode
}

export function CampaignDialog({ campaign, templates, contacts, children }: CampaignDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState<string>(campaign?.template_id ?? "")
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(campaign?.prospect_ids ?? [])

  useEffect(() => {
    if (open) {
      setTemplateId(campaign?.template_id ?? "")
      setSelectedContactIds(campaign?.prospect_ids ?? [])
    }
  }, [open, campaign?.id, campaign?.template_id, campaign?.prospect_ids])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setTemplateId(campaign?.template_id ?? "")
      setSelectedContactIds(campaign?.prospect_ids ?? [])
    }
  }

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const selectAllContacts = () => setSelectedContactIds(contacts.map((c) => c.id))
  const deselectAllContacts = () => setSelectedContactIds([])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    if (templateId) formData.set("template_id", templateId)
    formData.set("contact_ids", JSON.stringify(selectedContactIds))
    startTransition(async () => {
      try {
        if (campaign) {
          await updateCampaign(campaign.id, formData)
        } else {
          await createCampaign(formData)
        }
        setOpen(false)
        router.refresh()
      } catch (err) {
        console.error(err)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? 'Edit Campaign' : 'Create New Campaign'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={campaign?.name}
              required
              placeholder="e.g., Q1 Infrastructure Update"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={campaign?.description || ''}
              placeholder="Brief description of this campaign's purpose"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template_id">Message Template</Label>
            <Select
              value={templateId || undefined}
              onValueChange={setTemplateId}
            >
              <SelectTrigger id="template_id">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {templates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} ({template.channel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {templates.length === 0 ? 'Create a template first to use in campaigns' : 'The template will be used to generate messages'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Target Contacts</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose who receives this campaign. If none selected, all active contacts will be used when you start the campaign.
            </p>
            <div className="flex gap-2 mb-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllContacts}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={deselectAllContacts}>
                Deselect all
              </Button>
            </div>
            <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto p-2 space-y-1.5">
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No active contacts. Add contacts first.</p>
              ) : (
                contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedContactIds.includes(contact.id)}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <span className="truncate">{contact.name}</span>
                    {contact.email && (
                      <span className="text-muted-foreground truncate text-xs">({contact.email})</span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : campaign ? 'Update Campaign' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
