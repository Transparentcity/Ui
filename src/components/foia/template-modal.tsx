"use client"

import React, { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { createFoiaTemplate, updateFoiaTemplate } from "@/app/actions/foia"
import type { FoiaRequestTemplate } from "@/lib/foia/types"

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (template: FoiaRequestTemplate) => void
  template?: FoiaRequestTemplate | null // null = create, object = edit
}

export function TemplateModal({ open, onClose, onSaved, template }: Props) {
  const isEdit = !!template
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    name: "",
    dataset_type_id: "",
    jurisdiction_type: "",
    subject_template: "",
    body_template: "",
    notes: "",
  })

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        dataset_type_id: template.dataset_type_id ?? "",
        jurisdiction_type: template.jurisdiction_type ?? "",
        subject_template: template.subject_template,
        body_template: template.body_template,
        notes: template.notes ?? "",
      })
    } else {
      setForm({
        name: "",
        dataset_type_id: "",
        jurisdiction_type: "",
        subject_template: "",
        body_template: "",
        notes: "",
      })
    }
  }, [template, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.name.trim() || !form.subject_template.trim() || !form.body_template.trim()) {
      setError("Name, subject, and body are required")
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        subject_template: form.subject_template,
        body_template: form.body_template,
        ...(form.dataset_type_id ? { dataset_type_id: form.dataset_type_id } : {}),
        ...(form.jurisdiction_type ? { jurisdiction_type: form.jurisdiction_type } : {}),
        ...(form.notes ? { notes: form.notes } : {}),
      }

      let result: FoiaRequestTemplate
      if (isEdit && template) {
        result = (await updateFoiaTemplate(template.id, payload)) as FoiaRequestTemplate
      } else {
        result = (await createFoiaTemplate(payload)) as FoiaRequestTemplate
      }
      onSaved(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Template" : "New Template"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Template Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. CPRA Standard Request"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Dataset Type</label>
                <input
                  type="text"
                  value={form.dataset_type_id}
                  onChange={(e) => setForm((f) => ({ ...f, dataset_type_id: e.target.value }))}
                  placeholder="e.g. police_incidents"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Jurisdiction Type</label>
                <select
                  value={form.jurisdiction_type}
                  onChange={(e) => setForm((f) => ({ ...f, jurisdiction_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">Any</option>
                  <option value="state">State</option>
                  <option value="federal">Federal</option>
                  <option value="local">Local</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Subject Template *</label>
              <input
                type="text"
                value={form.subject_template}
                onChange={(e) => setForm((f) => ({ ...f, subject_template: e.target.value }))}
                placeholder="Public Records Request - [Dataset]"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Body Template *</label>
              <textarea
                value={form.body_template}
                onChange={(e) => setForm((f) => ({ ...f, body_template: e.target.value }))}
                rows={10}
                placeholder="Dear Records Custodian,&#10;&#10;Pursuant to..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes about this template..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as () => void}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  )
}
