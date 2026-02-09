"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function ensureMessageIdForSendQueueItem(
  db: ReturnType<typeof createClient>,
  sendQueueId: string
): Promise<{ message_id: string | null; prospect_id: string | null }> {
  const { data: sq, error: sqErr } = await db
    .from("send_queue")
    .select("*")
    .eq("id", sendQueueId)
    .single()

  if (sqErr || !sq) {
    console.error("[Responses] Failed to load send_queue item:", sqErr)
    throw new Error("Could not find that sent email in the send queue.")
  }

  const sqRow = sq as any
  const existingMessageId = (sqRow.message_id as string | null) || null
  const prospectId = (sqRow.prospect_id as string | null) || null
  if (existingMessageId) {
    return { message_id: existingMessageId, prospect_id: prospectId }
  }

  // Create a messages row from send_queue snapshot and link it back.
  const sentAt = (sqRow.sent_at as string | null) || null
  const status = sentAt ? "sent" : "pending"

  const { data: msg, error: msgErr } = await db
    .from("messages")
    .insert({
      campaign_id: sqRow.campaign_id || null,
      prospect_id: sqRow.prospect_id,
      template_id: sqRow.template_id || null,
      channel: sqRow.channel || "email",
      subject: sqRow.personalized_subject || null,
      body: sqRow.personalized_body || null,
      status,
      sent_at: sentAt,
    })
    .select()
    .single()

  if (msgErr || !msg) {
    console.error("[Responses] Failed creating message from send_queue:", msgErr)
    throw new Error("Failed to link this response to the sent email.")
  }

  const { error: updErr } = await db
    .from("send_queue")
    .update({ message_id: (msg as any).id })
    .eq("id", sendQueueId)

  if (updErr) {
    console.error("[Responses] Failed linking send_queue.message_id:", updErr)
    // non-fatal; response can still link to message
  }

  return { message_id: (msg as any).id as string, prospect_id: prospectId }
}

export async function createResponse(formData: FormData) {
  const db = await createClient()
  
  const prospect_id = formData.get('prospect_id') as string
  const channel = formData.get('channel') as string
  const content = formData.get('content') as string | null
  const sentiment = formData.get('sentiment') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const action_notes = formData.get('action_notes') as string | null
  const responded_at = formData.get('responded_at') as string
  const send_queue_raw = (formData.get("send_queue_id") as string | null) || null
  const send_queue_id =
    send_queue_raw && send_queue_raw !== "__none__" ? send_queue_raw : null

  let message_id: string | null = null
  if (send_queue_id) {
    const ensured = await ensureMessageIdForSendQueueItem(db, send_queue_id)
    message_id = ensured.message_id
    if (ensured.prospect_id && ensured.prospect_id !== prospect_id) {
      throw new Error("Selected sent email does not match the selected contact.")
    }
  }

  const { error } = await db
    .from('responses')
    .insert({
      message_id,
      prospect_id,
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
  revalidatePath('/send-queue')
  revalidatePath('/')
}

export async function updateResponse(id: string, formData: FormData) {
  const db = await createClient()
  
  const prospect_id = formData.get('prospect_id') as string
  const channel = formData.get('channel') as string
  const content = formData.get('content') as string | null
  const sentiment = formData.get('sentiment') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const action_notes = formData.get('action_notes') as string | null
  const send_queue_raw = (formData.get("send_queue_id") as string | null) || null
  const send_queue_id =
    send_queue_raw && send_queue_raw !== "__none__" ? send_queue_raw : null

  let message_id: string | null = null
  if (send_queue_id) {
    const ensured = await ensureMessageIdForSendQueueItem(db, send_queue_id)
    message_id = ensured.message_id
    if (ensured.prospect_id && ensured.prospect_id !== prospect_id) {
      throw new Error("Selected sent email does not match the selected contact.")
    }
  }

  const { error } = await db
    .from('responses')
    .update({
      prospect_id,
      message_id,
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
  revalidatePath('/send-queue')
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
