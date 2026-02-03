"use client"

import React from "react"
import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Clock, 
  Gauge, 
  Calendar, 
  Zap,
  Shield,
  Timer,
  AlertCircle,
  Settings2,
} from "lucide-react"
import type { ThrottleSettings as ThrottleSettingsType } from "@/lib/types"
import { THROTTLE_PRESETS, DEFAULT_THROTTLE_SETTINGS, estimateCompletionTime } from "@/lib/send-queue"
import { saveThrottleSettings, getThrottleSettings } from "@/app/actions/send-queue"

// Dialog wrapper for campaign throttle settings
interface ThrottleSettingsProps {
  campaignId: string
  children: React.ReactNode
}

export function ThrottleSettings({ campaignId, children }: ThrottleSettingsProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [settings, setSettings] = useState<Partial<ThrottleSettingsType>>(DEFAULT_THROTTLE_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && !loaded) {
      const existing = await getThrottleSettings(campaignId)
      if (existing) {
        setSettings(existing)
      }
      setLoaded(true)
    }
  }

  const handleSave = () => {
    startTransition(async () => {
      await saveThrottleSettings(campaignId, settings)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Throttle Settings
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="pb-2">
            <ThrottleSettingsEditor 
              settings={settings} 
              onChange={setSettings}
            />
          </div>
        </ScrollArea>
        <div className="flex-shrink-0 flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ThrottleSettingsEditorProps {
  settings: Partial<ThrottleSettingsType>
  onChange: (settings: Partial<ThrottleSettingsType>) => void
  queueSize?: number
}

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
]

export function ThrottleSettingsEditor({ settings, onChange, queueSize }: ThrottleSettingsEditorProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  
  const currentSettings = { ...DEFAULT_THROTTLE_SETTINGS, ...settings }
  
  const applyPreset = (presetKey: string) => {
    const preset = THROTTLE_PRESETS[presetKey as keyof typeof THROTTLE_PRESETS]
    if (preset) {
      setSelectedPreset(presetKey)
      onChange({
        ...currentSettings,
        emails_per_minute: preset.emails_per_minute,
        emails_per_hour: preset.emails_per_hour,
        emails_per_day: preset.emails_per_day,
        min_delay_seconds: preset.min_delay_seconds,
        max_delay_seconds: preset.max_delay_seconds,
      })
    }
  }
  
  const toggleDay = (day: string) => {
    const days = currentSettings.active_days || []
    const newDays = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day]
    onChange({ ...currentSettings, active_days: newDays })
    setSelectedPreset(null)
  }
  
  const updateSetting = <K extends keyof ThrottleSettingsType>(key: K, value: ThrottleSettingsType[K]) => {
    onChange({ ...currentSettings, [key]: value })
    setSelectedPreset(null)
  }
  
  const estimate = queueSize ? estimateCompletionTime(queueSize, currentSettings) : null

  return (
    <div className="space-y-6">
      {/* Presets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Quick Presets
          </CardTitle>
          <CardDescription className="text-xs">
            Choose a preset or customize below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(THROTTLE_PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                variant={selectedPreset === key ? "default" : "outline"}
                size="sm"
                className="flex flex-col h-auto py-3"
                onClick={() => applyPreset(key)}
              >
                <span className="font-medium">{preset.name}</span>
                <span className="text-xs opacity-70">{preset.emails_per_minute}/min</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Rate Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Rate Limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Per Minute</Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={currentSettings.emails_per_minute}
                onChange={(e) => updateSetting('emails_per_minute', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Per Hour</Label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={currentSettings.emails_per_hour}
                onChange={(e) => updateSetting('emails_per_hour', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Per Day</Label>
              <Input
                type="number"
                min="1"
                max="10000"
                value={currentSettings.emails_per_day}
                onChange={(e) => updateSetting('emails_per_day', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Delay Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="w-4 h-4" />
            Delay Between Sends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Minimum Delay (seconds)</Label>
              <Input
                type="number"
                min="1"
                max="300"
                value={currentSettings.min_delay_seconds}
                onChange={(e) => updateSetting('min_delay_seconds', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Maximum Delay (seconds)</Label>
              <Input
                type="number"
                min="1"
                max="300"
                value={currentSettings.max_delay_seconds}
                onChange={(e) => updateSetting('max_delay_seconds', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Randomize Delay</Label>
              <p className="text-xs text-muted-foreground">
                Vary delay between min and max for natural pacing
              </p>
            </div>
            <Switch
              checked={currentSettings.randomize_delay}
              onCheckedChange={(checked) => updateSetting('randomize_delay', checked)}
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Send Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Active Days</Label>
            <div className="flex gap-1">
              {DAYS_OF_WEEK.map(day => (
                <Button
                  key={day.value}
                  type="button"
                  variant={currentSettings.active_days?.includes(day.value) ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Start Hour</Label>
              <Select
                value={String(currentSettings.active_hours_start)}
                onValueChange={(v) => updateSetting('active_hours_start', parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">End Hour</Label>
              <Select
                value={String(currentSettings.active_hours_end)}
                onValueChange={(v) => updateSetting('active_hours_end', parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Respect Contact Timezone</Label>
              <p className="text-xs text-muted-foreground">
                Adjust send times to recipient's local time
              </p>
            </div>
            <Switch
              checked={currentSettings.respect_timezone}
              onCheckedChange={(checked) => updateSetting('respect_timezone', checked)}
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Estimate */}
      {estimate && queueSize && queueSize > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  Estimated completion: <span className="text-primary">{estimate.duration}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {queueSize} emails • Finishes around {estimate.endTime.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Warning */}
      {currentSettings.emails_per_minute > 20 && (
        <Card className="bg-warning/10 border-warning/20">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning-foreground">High Send Rate Warning</p>
                <p className="text-xs text-muted-foreground">
                  Sending more than 20 emails/minute may trigger spam filters. Consider using a more conservative rate.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
