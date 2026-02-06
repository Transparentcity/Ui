"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createResponse(formData: FormData) {
  const db = await createClient()
  
  const contact_id = formData.get('contact_id') as string
  const channel = formData.get('channel') as string
  const content = formData.get('content') as string | null
  const sentiment = formData.get('sentiment') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const action_notes = formData.get('action_notes') as string | null
  const responded_at = formData.get('responded_at') as string

  const { error } = await db
    .from('responses')
    .insert({
      contact_id,
      channel,
      content: content || null,
      sentiment: sentiment || null,
      priority,
      action_notes: action_notes || null,
      responded_at: responded_at || new Date().toISOString(),
      status: 'new'
    })

  if (error) {
    console.error('Error creating response:', error)
    throw new Error('Failed to create response')
  }

  revalidatePath('/responses')
  revalidatePath('/')
}

export async function updateResponse(id: string, formData: FormData) {
  const db = await createClient()
  
  const contact_id = formData.get('contact_id') as string
  const channel = formData.get('channel') as string
  const content = formData.get('content') as string | null
  const sentiment = formData.get('sentiment') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const action_notes = formData.get('action_notes') as string | null

  const { error } = await db
    .from('responses')
    .update({
      contact_id,
      channel,
      content: content || null,
      sentiment: sentiment || null,
      priority,
      action_notes: action_notes || null
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating response:', error)
    throw new Error('Failed to update response')
  }

  revalidatePath('/responses')
  revalidatePath('/')
}

export async function updateResponseStatus(id: string, status: string) {
  const db = await createClient()
  
  const updates: Record<string, unknown> = { status }
  
  if (status === 'reviewed' || status === 'actioned') {
    updates.reviewed_at = new Date().toISOString()
  }

  const { error } = await db
    .from('responses')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating response status:', error)
    throw new Error('Failed to update response status')
  }

  revalidatePath('/responses')
  revalidatePath('/')
}

export async function deleteResponse(id: string) {
  const db = await createClient()
  
  const { error } = await db
    .from('responses')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting response:', error)
    throw new Error('Failed to delete response')
  }

  revalidatePath('/responses')
  revalidatePath('/')
}
