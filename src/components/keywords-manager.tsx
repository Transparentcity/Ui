"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Search, Trash2, Users, AlertTriangle } from "lucide-react"
import { Keyword } from "@/lib/types"
import { createKeyword, deleteKeyword } from "@/app/actions/keywords"

interface KeywordWithCounts extends Keyword {
  contactCount: number
  anomalyCount: number
}

interface KeywordsManagerProps {
  keywords: KeywordWithCounts[]
}

export function KeywordsManager({ keywords }: KeywordsManagerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filteredKeywords = keywords.filter(keyword =>
    keyword.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    keyword.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      await createKeyword(formData)
      setOpen(false)
    })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this keyword?')) {
      startTransition(async () => {
        await deleteKeyword(id)
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Keyword
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Keyword</DialogTitle>
            </DialogHeader>
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Infrastructure, Budget, Housing"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="e.g., Policy Area, Department"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Brief description of this keyword"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Adding...' : 'Add Keyword'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredKeywords.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchQuery ? 'No keywords found matching your search' : 'No keywords yet. Add your first keyword to categorize contacts and anomalies.'}
            </CardContent>
          </Card>
        ) : (
          filteredKeywords.map((keyword) => (
            <Card key={keyword.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{keyword.name}</h3>
                      {keyword.category && (
                        <Badge variant="outline" className="text-xs">
                          {keyword.category}
                        </Badge>
                      )}
                    </div>
                    {keyword.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {keyword.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {keyword.contactCount} contacts
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {keyword.anomalyCount} anomalies
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(keyword.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
