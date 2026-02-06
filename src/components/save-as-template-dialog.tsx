"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Save } from "lucide-react"
import { createTemplateFromContent } from "@/app/actions/templates"

interface SaveAsTemplateDialogProps {
  content: string
  defaultName?: string
  defaultCategory?: string
  channel?: "email" | "sms"
  subject?: string
  children?: React.ReactNode
  onSaved?: () => void
}

export function SaveAsTemplateDialog({
  content,
  defaultName = "",
  defaultCategory = "Follow-up",
  channel = "email",
  subject = "",
  children,
  onSaved,
}: SaveAsTemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [selectedChannel, setSelectedChannel] = useState(channel)

  const handleSubmit = async (formData: FormData) => {
    formData.set("body", content)
    
    startTransition(async () => {
      await createTemplateFromContent(formData)
      setOpen(false)
      onSaved?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <Save className="w-4 h-4" />
            Save as Template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as Reply Template</DialogTitle>
          <DialogDescription>
            Save this response as a reusable template for future follow-ups.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaultName}
              required
              placeholder="e.g., Standard Follow-up Response"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select
                name="channel"
                defaultValue={channel}
                onValueChange={(value) => setSelectedChannel(value as "email" | "sms")}
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
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                defaultValue={defaultCategory}
                placeholder="e.g., Follow-up, Reply"
              />
            </div>
          </div>

          {selectedChannel === "email" && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                name="subject"
                defaultValue={subject}
                placeholder="e.g., Re: Following up on our discussion"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Message Preview</Label>
            <Textarea
              value={content}
              readOnly
              className="bg-muted/50"
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              This content will be saved as the template body.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !content.trim()}>
              {isPending ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
