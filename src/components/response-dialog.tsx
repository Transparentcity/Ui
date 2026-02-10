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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Response } from "@/lib/types"
import { createResponse, updateResponse } from "@/app/actions/responses"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { FollowupDialog } from "./followup-dialog"

interface Contact {
  id: string
  name: string
  organization: string | null
}

type SentEmailLite = {
  id: string
  prospect_id: string
  personalized_subject: string | null
  sent_at: string | null
  channel: string | null
}

interface ResponseDialogProps {
  response?: Response
  contacts: Contact[]
  sentEmails?: SentEmailLite[]
  children: React.ReactNode
}

export function ResponseDialog({ response, contacts, sentEmails = [], children }: ResponseDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const NO_EMAIL_VALUE = "__none__"
  const [selectedProspectId, setSelectedProspectId] = useState<string | undefined>(
    response?.prospect_id || undefined
  )
  const [contactOpen, setContactOpen] = useState(false)
  const [followupOpen, setFollowupOpen] = useState(false)
  const [followupResponseId, setFollowupResponseId] = useState<string | undefined>(
    response?.id
  )

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      if (response) {
        await updateResponse(response.id, formData)
      } else {
        const createdId = await createResponse(formData)
        setFollowupResponseId(createdId)
      }
      setOpen(false)

      const postAction = (formData.get("post_action") as string | null) || "save"
      if (postAction === "save_and_followup") {
        // Open the follow-up dialog immediately after saving.
        setFollowupOpen(true)
      }
    })
  }

  const selectedContact = selectedProspectId
    ? contacts.find((c) => c.id === selectedProspectId) || null
    : null

  const sentForProspect = selectedProspectId
    ? sentEmails.filter((e) => e.prospect_id === selectedProspectId)
    : []

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{response ? 'Edit Response' : 'Log New Response'}</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prospect_id">Contact *</Label>
            {/* Hidden field used by server action */}
            <input type="hidden" name="prospect_id" value={selectedProspectId || ""} />

            {/* Typeahead combobox (scales to long lists) */}
            <Popover open={contactOpen} onOpenChange={setContactOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={contactOpen}
                  className={cn("w-full justify-between", !selectedProspectId && "text-muted-foreground")}
                >
                  {selectedContact
                    ? `${selectedContact.name}${selectedContact.organization ? ` (${selectedContact.organization})` : ""}`
                    : "Select contact"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                portalled={false}
                className="w-(--radix-popover-trigger-width) p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search contacts..." />
                  <CommandList>
                    <CommandEmpty>No contacts found.</CommandEmpty>
                    <CommandGroup>
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.organization || ""}`}
                          // cmdk selection can be flaky inside dialogs depending on focus;
                          // handle onMouseDown to guarantee selection on click.
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setSelectedProspectId(c.id)
                            setContactOpen(false)
                          }}
                          onSelect={() => {
                            setSelectedProspectId(c.id)
                            setContactOpen(false)
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              selectedProspectId === c.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="flex-1 truncate">
                            {c.name}
                            {c.organization ? (
                              <span className="text-muted-foreground"> ({c.organization})</span>
                            ) : null}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="send_queue_id">Link to Sent Email (optional)</Label>
            <Select name="send_queue_id" defaultValue={NO_EMAIL_VALUE}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    selectedProspectId
                      ? sentForProspect.length > 0
                        ? "Select the email this reply is responding to"
                        : "No sent emails found for this contact"
                      : "Select a contact first"
                  }
                />
              </SelectTrigger>
              <SelectContent portalled={false}>
                <SelectItem value={NO_EMAIL_VALUE}>No linked email</SelectItem>
                {sentForProspect.map((e) => {
                  const when = e.sent_at ? new Date(e.sent_at).toLocaleDateString() : "unknown date"
                  const subj = e.personalized_subject?.trim() || "(no subject)"
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      {when} • {subj}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This connects the response to the exact email you sent via the CRM.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="channel">Channel *</Label>
              <Select name="channel" defaultValue={response?.channel || 'email'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="responded_at">Response Date</Label>
              <Input
                id="responded_at"
                name="responded_at"
                type="date"
                defaultValue={response?.responded_at?.split('T')[0] || new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Response Content</Label>
            <Textarea
              id="content"
              name="content"
              defaultValue={response?.content || ''}
              placeholder="Summary or full content of the response..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sentiment">Sentiment</Label>
              <Select name="sentiment" defaultValue={response?.sentiment || 'neutral'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sentiment" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue={String(response?.priority || 3)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent portalled={false}>
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
            <Label htmlFor="action_notes">Action Notes</Label>
            <Textarea
              id="action_notes"
              name="action_notes"
              defaultValue={response?.action_notes || ''}
              placeholder="Notes about actions taken or needed..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              name="post_action"
              value="save"
              variant="outline"
              disabled={isPending || !selectedProspectId}
            >
              {isPending ? "Saving..." : response ? "Update Response" : "Log Response"}
            </Button>
            <Button
              type="submit"
              name="post_action"
              value="save_and_followup"
              disabled={isPending || !selectedProspectId}
            >
              {isPending
                ? "Saving..."
                : response
                  ? "Update + Follow-up"
                  : "Log + Schedule Follow-up"}
            </Button>
          </div>
          </form>
        </DialogContent>
      </Dialog>

      <FollowupDialog
        open={followupOpen}
        onOpenChange={setFollowupOpen}
        hideTrigger
        contactId={selectedProspectId}
        responseId={followupResponseId}
        contactName={selectedContact?.name || undefined}
      />
    </>
  )
}
