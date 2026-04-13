"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserPlus, Pencil, Sparkles, Mail } from "lucide-react"
import { getContactActivity } from "@/app/actions/contacts"

interface ActivityEvent {
  type: string
  date: string
  detail: string
}

interface ContactActivityTimelineProps {
  contactId: string
  contactName: string
  children: React.ReactNode
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  contact_created: { icon: UserPlus, color: "text-blue-500", label: "Created" },
  contact_updated: { icon: Pencil, color: "text-gray-500", label: "Updated" },
  draft_generated: { icon: Sparkles, color: "text-purple-500", label: "Draft" },
  email_sent: { icon: Mail, color: "text-green-500", label: "Sent" },
}

export function ContactActivityTimeline({
  contactId,
  contactName,
  children,
}: ContactActivityTimelineProps) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getContactActivity(contactId)
      setEvents(data)
    } catch (err) {
      console.error("Failed to fetch activity:", err)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    if (open) {
      fetchActivity()
    }
  }, [open, fetchActivity])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity — {contactName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8" data-testid="activity-loading">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500" data-testid="activity-empty">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-0" data-testid="activity-list">
            {events.map((event, i) => {
              const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.contact_updated
              const Icon = config.icon
              return (
                <div key={`${event.type}-${event.date}-${i}`} className="flex gap-3 py-2.5">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-gray-50 ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {config.label}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(event.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{event.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
