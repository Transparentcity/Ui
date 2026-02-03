"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, ChevronDown, Check } from "lucide-react"
import { Template } from "@/lib/types"

interface ReplyTemplateSelectorProps {
  templates: Template[]
  onSelect: (template: Template) => void
  selectedTemplateId?: string
  disabled?: boolean
}

export function ReplyTemplateSelector({
  templates,
  onSelect,
  selectedTemplateId,
  disabled = false,
}: ReplyTemplateSelectorProps) {
  const [open, setOpen] = useState(false)

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || "Uncategorized"
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(template)
    return acc
  }, {} as Record<string, Template[]>)

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="justify-between gap-2"
          disabled={disabled}
        >
          <FileText className="w-4 h-4" />
          {selectedTemplate ? selectedTemplate.name : "Use Template"}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search templates..." />
          <CommandList>
            <CommandEmpty>No templates found.</CommandEmpty>
            <ScrollArea className="h-64">
              {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                <CommandGroup key={category} heading={category}>
                  {categoryTemplates.map((template) => (
                    <CommandItem
                      key={template.id}
                      value={`${template.name} ${template.category || ""}`}
                      onSelect={() => {
                        onSelect(template)
                        setOpen(false)
                      }}
                      className="flex flex-col items-start gap-1 py-2"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-medium flex-1">{template.name}</span>
                        {selectedTemplateId === template.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      {template.body && (
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {template.body.slice(0, 100)}
                          {template.body.length > 100 ? "..." : ""}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
