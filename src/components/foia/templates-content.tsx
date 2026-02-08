"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Edit3, Trash2 } from "lucide-react"
import { listFoiaTemplates, deleteFoiaTemplate } from "@/lib/foiaApiClient"
import type { FoiaRequestTemplate } from "@/lib/foia/types"
import { format } from "date-fns"

export function TemplatesContent() {
  const [templates, setTemplates] = useState<FoiaRequestTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await listFoiaTemplates()
        setTemplates(data)
      } catch (err) {
        console.error("Failed to load templates:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleDelete(id: number) {
    if (!confirm("Delete this template?")) return
    try {
      await deleteFoiaTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error("Failed to delete template:", err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reusable request letter templates by jurisdiction and dataset type
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700">
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      <div className="grid gap-4">
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">{tmpl.name}</h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  {tmpl.jurisdiction_type && <span>Jurisdiction: {tmpl.jurisdiction_type}</span>}
                  {tmpl.dataset_type_id && <span>Dataset: {tmpl.dataset_type_id}</span>}
                  <span>Updated {format(new Date(tmpl.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50" title="Edit">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(tmpl.id)}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500">Subject:</p>
              <p className="mt-0.5 text-sm text-gray-700">{tmpl.subject_template}</p>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500">Body preview:</p>
              <p className="mt-0.5 text-sm text-gray-500 line-clamp-3 whitespace-pre-line">
                {tmpl.body_template}
              </p>
            </div>
            {tmpl.notes && (
              <p className="mt-2 text-xs text-gray-400 italic">{tmpl.notes}</p>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
            No templates created yet.
          </div>
        )}
      </div>
    </div>
  )
}
