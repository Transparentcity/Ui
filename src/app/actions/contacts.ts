"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createContact(formData: FormData) {
  const db = createClient()
  
  const name = formData.get('name') as string
  const title = formData.get('title') as string | null
  const organization = formData.get('organization') as string | null
  const department = formData.get('department') as string | null
  const email = formData.get('email') as string | null
  const phone = formData.get('phone') as string | null
  const jurisdiction = formData.get('jurisdiction') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const status = formData.get('status') as string || 'active'
  const notes = formData.get('notes') as string | null
  const keywords = JSON.parse(formData.get('keywords') as string || '[]')

  const { data: contact, error } = await db
    .from('prospects')
    .insert({
      name,
      title: title || null,
      organization: organization || null,
      department: department || null,
      email: email || null,
      phone: phone || null,
      jurisdiction: jurisdiction || null,
      priority,
      status,
      notes: notes || null
    })
    .select()
    .single() as { data: { id: string } | null; error: Error | null }

  if (error || !contact) {
    console.error('Error creating contact:', error)
    throw new Error('Failed to create contact')
  }

  // Add keyword relationships
  if (keywords.length > 0) {
    const keywordRelations = keywords.map((keywordId: string) => ({
      prospect_id: contact.id,
      keyword_id: keywordId
    }))

    await db.from('prospect_keywords').insert(keywordRelations)
  }

  revalidatePath('/contacts')
  revalidatePath('/')
}

export async function updateContact(id: string, formData: FormData) {
  const db = createClient()
  
  const name = formData.get('name') as string
  const title = formData.get('title') as string | null
  const organization = formData.get('organization') as string | null
  const department = formData.get('department') as string | null
  const email = formData.get('email') as string | null
  const phone = formData.get('phone') as string | null
  const jurisdiction = formData.get('jurisdiction') as string | null
  const priority = parseInt(formData.get('priority') as string) || 3
  const status = formData.get('status') as string || 'active'
  const notes = formData.get('notes') as string | null
  const keywords = JSON.parse(formData.get('keywords') as string || '[]')

  const { error } = await db
    .from('prospects')
    .update({
      name,
      title: title || null,
      organization: organization || null,
      department: department || null,
      email: email || null,
      phone: phone || null,
      jurisdiction: jurisdiction || null,
      priority,
      status,
      notes: notes || null
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating contact:', error)
    throw new Error('Failed to update contact')
  }

  // Update keyword relationships
  await db.from('prospect_keywords').delete().eq('prospect_id', id)
  
  if (keywords.length > 0) {
    const keywordRelations = keywords.map((keywordId: string) => ({
      prospect_id: id,
      keyword_id: keywordId
    }))
    await db.from('prospect_keywords').insert(keywordRelations)
  }

  revalidatePath('/contacts')
  revalidatePath('/')
}

export async function deleteContact(id: string) {
  const db = createClient()
  
  const { error } = await db
    .from('prospects')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting contact:', error)
    throw new Error('Failed to delete contact')
  }

  revalidatePath('/contacts')
  revalidatePath('/')
}

/** Lightweight list for pickers/typeaheads (client-side filtering). */
export async function listActiveContactsLite(): Promise<
  Array<{
    id: string
    name: string
    email: string | null
    organization: string | null
    department: string | null
    jurisdiction: string | null
    status: string
  }>
> {
  const db = createClient()
  const { data, error } = await db
    .from("prospects")
    .select("id, name, email, organization, department, jurisdiction, status")
    .order("name")

  if (error) {
    console.error("[Contacts] Error listing contacts lite:", error)
    throw new Error("Failed to load contacts")
  }

  const arr = Array.isArray(data) ? data : []
  // Keep only active by default (but status is returned for UI display if needed).
  return arr.filter((c: any) => (c?.status || "active") === "active")
}

// Bulk import contacts from CSV
interface ImportContact {
  name: string
  email: string | null
  phone: string | null
  title: string | null
  organization: string | null
  department: string | null
  jurisdiction: string | null
  priority: number
  notes: string | null
  keywordIds: string[]
}

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

export async function importContacts(contacts: ImportContact[]): Promise<ImportResult> {
  const errors: string[] = []
  
  // Early validation
  if (!contacts || contacts.length === 0) {
    return { success: 0, failed: 0, errors: ['No contacts to import'] }
  }

  console.log('[Import] Starting import of', contacts.length, 'contacts')

  let db
  try {
    db = createClient()
  } catch (e) {
    console.error('[Import] Database connection error:', e)
    return { 
      success: 0, 
      failed: contacts.length, 
      errors: [`Database connection failed: ${e instanceof Error ? e.message : 'Unknown error'}`] 
    }
  }
  
  let success = 0
  let failed = 0

  // Process in batches of 50 to avoid timeout
  const batchSize = 50
  
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize)
    
    // Insert contacts
    const contactsToInsert = batch.map(c => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      title: c.title,
      organization: c.organization,
      department: c.department,
      jurisdiction: c.jurisdiction,
      priority: c.priority,
      status: 'active' as const,
      notes: c.notes,
    }))

    console.log('[Import] Inserting batch', Math.floor(i / batchSize) + 1, 'with', contactsToInsert.length, 'contacts')
    console.log('[Import] Sample contact:', JSON.stringify(contactsToInsert[0]))

    try {
      const { data: insertedContacts, error } = await db
        .from('prospects')
        .insert(contactsToInsert)
        .select('id')

      if (error) {
        console.error('[Import] Batch error:', error)
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
        failed += batch.length
        continue
      }

      // Add keyword relationships for each inserted contact
      const insertedArray = Array.isArray(insertedContacts) ? insertedContacts : (insertedContacts ? [insertedContacts] : [])
      
      if (insertedArray.length === 0) {
        console.error('[Import] No contacts returned for batch', Math.floor(i / batchSize) + 1)
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: Database returned no results - check if table exists`)
        failed += batch.length
        continue
      }

      console.log('[Import] Successfully inserted', insertedArray.length, 'contacts')
      for (let j = 0; j < insertedArray.length; j++) {
        const contact = insertedArray[j] as { id: string }
        const keywordIds = batch[j]?.keywordIds || []

        if (keywordIds.length > 0) {
          const keywordRelations = keywordIds.map(keywordId => ({
            prospect_id: contact.id,
            keyword_id: keywordId
          }))

          const { error: kwError } = await db
            .from('prospect_keywords')
            .insert(keywordRelations)

          if (kwError) {
            console.error('[Import] Keyword error for', batch[j]?.name, ':', kwError)
            errors.push(`Contact "${batch[j]?.name}": Failed to add keywords - ${kwError.message}`)
          }
        }
      }

      success += insertedArray.length
    } catch (batchError) {
      console.error('[Import] Unexpected batch error:', batchError)
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unexpected error'}`)
      failed += batch.length
    }
  }

  console.log('[Import] Complete:', { success, failed, errors })

  revalidatePath('/contacts')
  revalidatePath('/')

  return { success, failed, errors }
}
