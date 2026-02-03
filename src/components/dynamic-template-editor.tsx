"use client"

import React from "react"

import { useState, useTransition, useMemo } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Plus, 
  Trash2, 
  Wand2, 
  Eye, 
  Code, 
  Info,
  Shuffle,
  Copy,
  Check,
  Mail,
  MessageSquare,
} from "lucide-react"
import type { TemplateWithVariations, ToneProfile, Contact } from "@/lib/types"
import { createDynamicTemplate, updateDynamicTemplate } from "@/app/actions/dynamic-templates"
import { generatePreviews } from "@/lib/template-engine"

interface DynamicTemplateEditorProps {
  template?: TemplateWithVariations
  toneProfiles: ToneProfile[]
  sampleContact?: Contact
  children: React.ReactNode
}

const VARIATION_SLOTS = [
  { key: 'greeting', label: 'Greeting', description: 'Opening salutation' },
  { key: 'opening', label: 'Opening Line', description: 'First sentence after greeting' },
  { key: 'anomaly_intro', label: 'Anomaly Introduction', description: 'How to introduce the data finding' },
  { key: 'call_to_action', label: 'Call to Action', description: 'Request for response' },
  { key: 'closing', label: 'Closing', description: 'Thank you and wrap-up' },
  { key: 'signature', label: 'Signature', description: 'Sign-off phrase' },
]

const TEMPLATE_VARIABLES = [
  { var: '{{name}}', desc: 'Contact\'s name' },
  { var: '{{title}}', desc: 'Contact\'s title' },
  { var: '{{organization}}', desc: 'Organization name' },
  { var: '{{department}}', desc: 'Department name' },
  { var: '{{jurisdiction}}', desc: 'Jurisdiction/area' },
  { var: '{{anomaly_title}}', desc: 'Anomaly title' },
  { var: '{{anomaly_description}}', desc: 'Anomaly details' },
  { var: '{{anomaly_snippet}}', desc: 'Unique anomaly intro per recipient' },
]

export function DynamicTemplateEditor({ 
  template, 
  toneProfiles, 
  sampleContact,
  children 
}: DynamicTemplateEditorProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState("compose")
  const [copied, setCopied] = useState<string | null>(null)
  
  // Form state
  const [channel, setChannel] = useState(template?.channel || 'email')
  const [name, setName] = useState(template?.name || '')
  const [category, setCategory] = useState(template?.category || '')
  const [subject, setSubject] = useState(template?.subject || '')
  const [body, setBody] = useState(template?.body || '')
  const [variationEnabled, setVariationEnabled] = useState(template?.variation_enabled !== false)
  const [toneProfileId, setToneProfileId] = useState(template?.tone_profile?.id || 'default')
  
  // Subject variations
  const [subjectVariations, setSubjectVariations] = useState<{ subject: string; weight: number }[]>(
    template?.subject_variations?.map(v => ({ subject: v.subject, weight: v.weight })) || []
  )
  
  // Custom slot variations
  const [customVariations, setCustomVariations] = useState<Record<string, string[]>>(
    template?.variations?.reduce((acc, v) => {
      acc[v.variation_key] = v.variations
      return acc
    }, {} as Record<string, string[]>) || {}
  )

  // Generate previews
  const previews = useMemo(() => {
    if (!sampleContact || !body) return []
    
    const mockTemplate: TemplateWithVariations = {
      id: template?.id || 'preview',
      name,
      subject,
      body,
      channel: channel as 'email' | 'sms',
      category,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      variation_enabled: variationEnabled,
      tone_profile: toneProfiles.find(t => t.id === toneProfileId) || null,
      subject_variations: subjectVariations.map((v, i) => ({
        id: `preview-${i}`,
        template_id: 'preview',
        subject: v.subject,
        weight: v.weight,
        created_at: new Date().toISOString(),
      })),
    }
    
    const mockAnomaly = {
      id: 'sample',
      title: 'Budget Discrepancy in Q4 Report',
      description: 'Unexpected variance of $2.3M between projected and actual spending',
      data_source: 'Financial Database',
      severity: 'high' as const,
      status: 'new' as const,
      metadata: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    return generatePreviews(mockTemplate, sampleContact, mockAnomaly, 3)
  }, [body, subject, channel, name, category, variationEnabled, toneProfileId, subjectVariations, sampleContact, toneProfiles, template?.id])

  const insertVariable = (variable: string) => {
    setBody(prev => prev + variable)
  }
  
  const insertSlot = (slotKey: string) => {
    const customVars = customVariations[slotKey]
    if (customVars && customVars.length > 0) {
      setBody(prev => prev + `[[slot:${slotKey}|${customVars.join('|')}]]`)
    } else {
      setBody(prev => prev + `[[slot:${slotKey}]]`)
    }
  }
  
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }
  
  const addSubjectVariation = () => {
    setSubjectVariations(prev => [...prev, { subject: '', weight: 1 }])
  }
  
  const removeSubjectVariation = (index: number) => {
    setSubjectVariations(prev => prev.filter((_, i) => i !== index))
  }
  
  const updateSubjectVariation = (index: number, field: 'subject' | 'weight', value: string | number) => {
    setSubjectVariations(prev => prev.map((v, i) => 
      i === index ? { ...v, [field]: value } : v
    ))
  }
  
  const addCustomVariation = (slotKey: string) => {
    setCustomVariations(prev => ({
      ...prev,
      [slotKey]: [...(prev[slotKey] || []), '']
    }))
  }
  
  const removeCustomVariation = (slotKey: string, index: number) => {
    setCustomVariations(prev => ({
      ...prev,
      [slotKey]: prev[slotKey]?.filter((_, i) => i !== index) || []
    }))
  }
  
  const updateCustomVariation = (slotKey: string, index: number, value: string) => {
    setCustomVariations(prev => ({
      ...prev,
      [slotKey]: prev[slotKey]?.map((v, i) => i === index ? value : v) || []
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append('name', name)
    formData.append('channel', channel)
    formData.append('category', category)
    formData.append('subject', subject)
    formData.append('body', body)
    formData.append('variation_enabled', String(variationEnabled))
    formData.append('tone_profile_id', toneProfileId)
    formData.append('subject_variations', JSON.stringify(subjectVariations))
    formData.append('custom_variations', JSON.stringify(customVariations))
    
    startTransition(async () => {
      if (template) {
        await updateDynamicTemplate(template.id, formData)
      } else {
        await createDynamicTemplate(formData)
      }
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            {template ? 'Edit Dynamic Template' : 'Create Dynamic Template'}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="variations" className="flex items-center gap-2">
              <Shuffle className="w-4 h-4" />
              Variations
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="help" className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              Help
            </TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            <TabsContent value="compose" className="flex-1 overflow-auto mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g., Initial Outreach"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Channel *</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as "email" | "sms")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <span className="flex items-center gap-2">
                          <Mail className="w-4 h-4" /> Email
                        </span>
                      </SelectItem>
                      <SelectItem value="sms">
                        <span className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" /> SMS
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Follow-up"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tone">Tone Profile</Label>
                  <Select value={toneProfileId} onValueChange={setToneProfileId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (Professional)</SelectItem>
                      {toneProfiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name} — {profile.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="variation-enabled"
                      checked={variationEnabled}
                      onCheckedChange={setVariationEnabled}
                    />
                    <Label htmlFor="variation-enabled" className="cursor-pointer">
                      Enable dynamic variations
                    </Label>
                  </div>
                </div>
              </div>
              
              {channel === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g., Important Data Update for {{jurisdiction}}"
                  />
                  <p className="text-xs text-muted-foreground">
                    Primary subject. Add variations in the Variations tab.
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Message Body *</Label>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      {VARIATION_SLOTS.slice(0, 4).map(slot => (
                        <Tooltip key={slot.key}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs bg-transparent"
                              onClick={() => insertSlot(slot.key)}
                            >
                              +{slot.label}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Insert {slot.label} variation slot</p>
                            <p className="text-xs text-muted-foreground">{slot.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </TooltipProvider>
                  </div>
                </div>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  placeholder={`[[slot:greeting]],

[[slot:opening]] some important data that affects {{jurisdiction}}.

{{anomaly_snippet}}

[[slot:call_to_action]]

[[slot:closing]]

[[slot:signature]]
Transparent City Team`}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground py-1">Insert variable:</span>
                {TEMPLATE_VARIABLES.map(v => (
                  <Badge
                    key={v.var}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => insertVariable(v.var)}
                  >
                    {v.var}
                  </Badge>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="variations" className="flex-1 overflow-auto mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-6">
                  {/* Subject Variations */}
                  {channel === 'email' && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          Subject Line Variations
                          <Button type="button" variant="outline" size="sm" onClick={addSubjectVariation}>
                            <Plus className="w-4 h-4 mr-1" /> Add Variation
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Add alternative subject lines. Weight determines selection probability (higher = more likely).
                        </p>
                        {subjectVariations.map((variation, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <Input
                              value={variation.subject}
                              onChange={(e) => updateSubjectVariation(index, 'subject', e.target.value)}
                              placeholder="Alternative subject..."
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              min="1"
                              max="10"
                              value={variation.weight}
                              onChange={(e) => updateSubjectVariation(index, 'weight', parseInt(e.target.value) || 1)}
                              className="w-20"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSubjectVariation(index)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        {subjectVariations.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No variations yet. The primary subject will be used.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Custom Slot Variations */}
                  {VARIATION_SLOTS.map(slot => (
                    <Card key={slot.key}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>
                            {slot.label}
                            <span className="text-xs text-muted-foreground ml-2 font-normal">
                              — {slot.description}
                            </span>
                          </span>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => addCustomVariation(slot.key)}
                          >
                            <Plus className="w-4 h-4 mr-1" /> Add Custom
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(customVariations[slot.key] || []).map((variation, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <Input
                              value={variation}
                              onChange={(e) => updateCustomVariation(slot.key, index, e.target.value)}
                              placeholder={`Custom ${slot.label.toLowerCase()}...`}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCustomVariation(slot.key, index)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        {(!customVariations[slot.key] || customVariations[slot.key].length === 0) && (
                          <p className="text-xs text-muted-foreground">
                            Using default variations based on tone profile.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
              {!sampleContact ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p>Add at least one contact to preview how emails will look.</p>
                  </CardContent>
                </Card>
              ) : previews.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p>Add a message body to see previews.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Here are 3 variations of how your email might appear. Each recipient gets a unique version.
                  </p>
                  {previews.map((preview, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">
                            Variation {index + 1}
                            <Badge variant="outline" className="ml-2 text-xs">
                              Seed: {preview.variationData.seed}
                            </Badge>
                          </CardTitle>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(preview.body, `preview-${index}`)}
                          >
                            {copied === `preview-${index}` ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        {channel === 'email' && preview.subject && (
                          <p className="text-sm font-medium">
                            Subject: {preview.subject}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                          {preview.body}
                        </div>
                        {preview.variationData.slotsUsed.length > 0 && (
                          <div className="mt-2 flex gap-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">Slots used:</span>
                            {preview.variationData.slotsUsed.map(slot => (
                              <Badge key={slot} variant="secondary" className="text-xs">
                                {slot}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="help" className="flex-1 overflow-auto mt-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Template Variables</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {TEMPLATE_VARIABLES.map(v => (
                      <div key={v.var} className="flex items-center gap-3 text-sm">
                        <code className="bg-muted px-2 py-1 rounded text-xs">{v.var}</code>
                        <span className="text-muted-foreground">{v.desc}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Variation Slots</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-3">
                      Insert these markers to automatically vary content based on tone profile:
                    </p>
                    {VARIATION_SLOTS.map(slot => (
                      <div key={slot.key} className="flex items-center gap-3 text-sm">
                        <code className="bg-muted px-2 py-1 rounded text-xs">[[slot:{slot.key}]]</code>
                        <span className="text-muted-foreground">{slot.description}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Spam Avoidance Tips</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Use multiple subject variations with different wording</li>
                      <li>Include {'{{anomaly_snippet}}'} for unique content per recipient</li>
                      <li>Vary greetings and closings using slots</li>
                      <li>Use throttling to space out delivery</li>
                      <li>Recipients in the same office automatically get different variations</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <Separator className="my-4" />
            
            <div className="flex justify-end gap-3 pb-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
