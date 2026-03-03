"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createFollowup(formData: FormData) {
  const db = await createClient()
  
  const prospect_id = formData.get('prospect_id') as string
  const response_id = formData.get('response_id') as string | null
  const title = formData.get('title') as string
  const description = formData.get('description') as string | null
  const due_date = formData.get('due_date') as string
  const priority = parseInt(formData.get('priority') as string) || 3

  const { error } = await db
    .from('followups')
    .insert({
      prospect_id,
      response_id: response_id || null,
      title,
      description: description || null,
      due_date: new Date(due_date).toISOString(),
      priority,
      status: 'pending'
    })

  if (error) {
    console.error('Error creating followup:', error)
    throw new Error('Failed to create followup')
  }

  revalidatePath('/followups')
  revalidatePath('/responses')
  revalidatePath('/')
}

export async function updateFollowup(id: string, formData: FormData) {
  const db = await createClient()
  
  const title = formData.get('title') as string
  const description = formData.get('description') as string | null
  const due_date = formData.get('due_date') as string
  const priority = parseInt(formData.get('priority') as string) || 3

  const { error } = await db
    .from('followups')
    .update({
      title,
      description: description || null,
      due_date: new Date(due_date).toISOString(),
      priority
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating followup:', error)
    throw new Error('Failed to update followup')
  }

  revalidatePath('/followups')
  revalidatePath('/')
}

export async function updateFollowupStatus(id: string, status: string) {
  const db = await createClient()
  
  const updates: Record<string, unknown> = { status }
  
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
  }

  const { error } = await db
    .from('followups')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating followup status:', error)
    throw new Error('Failed to update followup status')
  }

  revalidatePath('/followups')
  revalidatePath('/')
}

export async function deleteFollowup(id: string) {
  const db = await createClient()
  
  const { error } = await db
    .from('followups')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting followup:', error)
    throw new Error('Failed to delete followup')
  }

  revalidatePath('/followups')
  revalidatePath('/')
}
