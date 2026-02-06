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
import { Badge } from "@/components/ui/badge"
import { Anomaly, Keyword } from "@/lib/types"
import { createAnomaly, updateAnomaly } from "@/app/actions/anomalies"
import { X } from "lucide-react"

interface AnomalyWithKeywords extends Anomaly {
  keywords?: Keyword[]
}

interface AnomalyDialogProps {
  anomaly?: AnomalyWithKeywords
  keywords: Keyword[]
  children: React.ReactNode
}

export function AnomalyDialog({ anomaly, keywords, children }: AnomalyDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(
    anomaly?.keywords?.map(k => k.id) || []
  )

  const handleSubmit = async (formData: FormData) => {
    formData.append('keywords', JSON.stringify(selectedKeywords))
    
    startTransition(async () => {
      if (anomaly) {
        await updateAnomaly(String(anomaly.id), formData)
      } else {
        await createAnomaly(formData)
      }
      setOpen(false)
    })
  }

  const toggleKeyword = (keywordId: string) => {
    setSelectedKeywords(prev =>
      prev.includes(keywordId)
        ? prev.filter(id => id !== keywordId)
        : [...prev, keywordId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{anomaly ? 'Edit Anomaly' : 'Add New Anomaly'}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={anomaly?.title}
              required
              placeholder="e.g., Unusual spike in permit processing times"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={anomaly?.description || ''}
              placeholder="Detailed description of the anomaly..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Input
                id="district"
                name="district"
                defaultValue={anomaly?.district_label || ''}
                placeholder="e.g., D1, D5, Mission (blank = no specific district)"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for non-district-specific data
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select name="severity" defaultValue={anomaly?.severity || 'medium'}>
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_source">Data Source</Label>
              <Input
                id="data_source"
                name="data_source"
                defaultValue={anomaly?.data_source || ''}
                placeholder="e.g., Permit Database"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_citywide"
                name="is_citywide"
                defaultChecked={anomaly?.is_citywide || false}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_citywide" className="text-sm font-normal">
                Citywide (send to all contacts)
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Keywords (for matching with contacts)</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[60px] bg-muted/30">
              {selectedKeywords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No keywords selected</p>
              ) : (
                selectedKeywords.map(keywordId => {
                  const keyword = keywords.find(k => k.id === keywordId)
                  return keyword ? (
                    <Badge 
                      key={keyword.id} 
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer"
                      onClick={() => toggleKeyword(keyword.id)}
                    >
                      {keyword.name}
                      <X className="w-3 h-3" />
                    </Badge>
                  ) : null
                })
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {keywords
                .filter(k => !selectedKeywords.includes(k.id))
                .map(keyword => (
                  <Badge
                    key={keyword.id}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => toggleKeyword(keyword.id)}
                  >
                    + {keyword.name}
                  </Badge>
                ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : anomaly ? 'Update Anomaly' : 'Add Anomaly'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
