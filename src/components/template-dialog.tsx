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
import { Template } from "@/lib/types"
import { createTemplate, updateTemplate } from "@/app/actions/templates"

interface TemplateDialogProps {
  template?: Template
  children: React.ReactNode
}

export function TemplateDialog({ template, children }: TemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [channel, setChannel] = useState(template?.channel || 'email')

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      if (template) {
        await updateTemplate(template.id, formData)
      } else {
        await createTemplate(formData)
      }
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Create New Template'}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={template?.name}
                required
                placeholder="e.g., Initial Outreach"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel">Channel *</Label>
              <Select 
                name="channel" 
                defaultValue={template?.channel || 'email'}
                onValueChange={(v) => setChannel(v as "email" | "sms")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              defaultValue={template?.category || ''}
              placeholder="e.g., Follow-up, Introduction, Alert"
            />
          </div>

          {channel === 'email' && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                name="subject"
                defaultValue={template?.subject || ''}
                placeholder="e.g., Important Data Update"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="body">Message Body *</Label>
            <Textarea
              id="body"
              name="body"
              defaultValue={template?.body}
              required
              placeholder={channel === 'email' 
                ? "Write your email template here. This is useful for quick manual sends or as a starting point for AI Compose."
                : "Write your SMS template here."
              }
              rows={channel === 'email' ? 12 : 4}
            />
            <p className="text-xs text-muted-foreground">
              Tip: Use AI Compose for personalized, unique emails to each contact.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
