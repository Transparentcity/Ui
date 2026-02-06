"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

function parseContactIds(formData: FormData): string[] {
  const raw = formData.get('contact_ids')
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export async function createCampaign(formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const description = formData.get('description') as string | null
  const template_id = formData.get('template_id') as string | null
  const contactIds = parseContactIds(formData)

  const result = await new Promise<{ data: { id: string }[] | null; error: Error | null }>((res) => {
    db.from('campaigns')
      .insert({
        name,
        description: description || null,
        template_id: template_id || null,
        status: 'draft'
      })
      .then(res)
  })

  if (result.error) {
    console.error('Error creating campaign:', result.error)
    throw new Error('Failed to create campaign')
  }

  const campaignId = result.data?.[0]?.id
  if (campaignId && contactIds.length > 0) {
    const { error: prospectsError } = await db
      .from('campaign_prospects')
      .insert(contactIds.map((prospect_id) => ({ campaign_id: campaignId, prospect_id })))

    if (prospectsError) {
      console.error('Error linking campaign prospects:', prospectsError)
    }
  }

  revalidatePath('/campaigns')
  revalidatePath('/')
}

export async function updateCampaign(id: string, formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const description = formData.get('description') as string | null
  const template_id = formData.get('template_id') as string | null
  const contactIds = parseContactIds(formData)

  const { error } = await db
    .from('campaigns')
    .update({
      name,
      description: description || null,
      template_id: template_id || null
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating campaign:', error)
    throw new Error('Failed to update campaign')
  }

  await new Promise<void>((res) => {
    db.from('campaign_prospects').delete().eq('campaign_id', id).then(() => res())
  })
  if (contactIds.length > 0) {
    const { error: prospectsError } = await db
      .from('campaign_prospects')
      .insert(contactIds.map((prospect_id) => ({ campaign_id: id, prospect_id })))

    if (prospectsError) {
      console.error('Error updating campaign prospects:', prospectsError)
    }
  }

  revalidatePath('/campaigns')
  revalidatePath('/')
}

export async function updateCampaignStatus(id: string, status: string) {
  const db = await createClient()
  
  const updates: Record<string, unknown> = { status }
  
  if (status === 'active') {
    updates.started_at = new Date().toISOString()
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString()
  }

  const { error } = await db
    .from('campaigns')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating campaign status:', error)
    throw new Error('Failed to update campaign status')
  }

  revalidatePath('/campaigns')
  revalidatePath('/')
}

export async function deleteCampaign(id: string) {
  const db = await createClient()
  
  const { error } = await db
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting campaign:', error)
    throw new Error('Failed to delete campaign')
  }

  revalidatePath('/campaigns')
  revalidatePath('/')
}
