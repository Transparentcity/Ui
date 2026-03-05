"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Edit3, Trash2, AlertTriangle } from "lucide-react"
import { useAuth0 } from "@auth0/auth0-react"
import { toast } from "sonner"
import { listFoiaTemplates, deleteFoiaTemplate } from "@/lib/foiaApiClient"
import { TemplateModal } from "@/components/foia/template-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { datasetLabel } from "@/lib/foia/datasetLabels"
import type { FoiaRequestTemplate } from "@/lib/foia/types"
import { format } from "date-fns"

export function TemplatesContent() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()
  const [templates, setTemplates] = useState<FoiaRequestTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FoiaRequestTemplate | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setApiError(null)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      const data = await listFoiaTemplates(token)
      setTemplates(data)
    } catch (err) {
      console.error("Failed to load templates:", err)
      setApiError(err instanceof Error ? err.message : "Failed to load templates")
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, getAccessTokenSilently])

  useEffect(() => {
    load()
  }, [load])

  async function handleDeleteConfirm(id: number) {
    setDeletingId(id)
    let token: string | undefined
    if (isAuthenticated) {
      try {
        token = await getAccessTokenSilently()
      } catch {
        // continue without token
      }
    }
    try {
      await deleteFoiaTemplate(id, token)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setDeleteConfirmId(null)
      toast.success("Template deleted")
    } catch (err) {
      console.error("Failed to delete template:", err)
      toast.error(err instanceof Error ? err.message : "Failed to delete template")
    } finally {
      setDeletingId(null)
    }
  }

  function handleEdit(tmpl: FoiaRequestTemplate) {
    setEditingTemplate(tmpl)
    setShowModal(true)
  }

  function handleNew() {
    setEditingTemplate(null)
    setShowModal(true)
  }

  function handleSaved() {
    // Reload templates after create/edit
    load()
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
      {apiError && (
        <div
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Could not load templates</p>
            <p className="mt-0.5 text-amber-700">{apiError}</p>
            <p className="mt-1 text-xs text-amber-600">
              Ensure the backend is running and{" "}
              <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_BASE_URL</code> matches
              (e.g. <code className="rounded bg-amber-100 px-1">http://localhost:8001</code>). Sign
              in as an admin if the API requires authentication.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reusable request letter templates by jurisdiction and dataset type
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
        >
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
                  {tmpl.dataset_type_id && <span>Dataset: {datasetLabel(tmpl.dataset_type_id)}</span>}
                  <span>Updated {format(new Date(tmpl.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleEdit(tmpl)}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  aria-label="Edit template"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(tmpl.id)}
                  disabled={deletingId === tmpl.id}
                  className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                  aria-label="Delete template"
                >
                  {deletingId === tmpl.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
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
        {templates.length === 0 && !loading && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
            {apiError ? "Templates could not be loaded. Check the message above." : "No templates created yet."}
          </div>
        )}
      </div>

      <TemplateModal
        open={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingTemplate(null)
        }}
        onSaved={handleSaved}
        template={editingTemplate}
      />

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
        title="Delete template"
        description="This template will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { if (deleteConfirmId !== null) handleDeleteConfirm(deleteConfirmId) }}
        loading={deletingId !== null}
      />
    </div>
  )
}
