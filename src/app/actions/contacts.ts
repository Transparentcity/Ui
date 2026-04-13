"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

function parseStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === "string")
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val) as unknown
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : val.trim() ? val.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []
    } catch {
      return val.trim() ? val.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []
    }
  }
  return []
}

export async function createContact(formData: FormData) {
  const db = createClient()

  const contact_type = (formData.get("contact_type") as string) || "city_staff"
  const name = formData.get("name") as string
  const title = formData.get("title") as string | null
  const organization = formData.get("organization") as string | null
  const department = formData.get("department") as string | null
  const email = formData.get("email") as string | null
  const phone = formData.get("phone") as string | null
  const jurisdiction = formData.get("jurisdiction") as string | null
  const cityIdRaw = formData.get("city_id") as string | null
  const city_id = cityIdRaw ? parseInt(cityIdRaw) || null : null
  const city_name = (formData.get("city_name") as string)?.trim() || null
  const outlet_platform = formData.get("outlet_platform") as string | null
  const primary_beat = formData.get("primary_beat") as string | null
  const primary_city = (formData.get("primary_city") as string)?.trim() || null
  const coverage_cities = parseStringArray(formData.get("coverage_cities"))
  const sub_geographies = parseStringArray(formData.get("sub_geographies"))
  const priority = parseInt(formData.get("priority") as string) || 3
  const status = formData.get("status") as string || "active"
  const notes = formData.get("notes") as string | null
  const keywords = JSON.parse((formData.get("keywords") as string) || "[]") as string[]
  const article_urls = parseStringArray(formData.get("article_urls"))

  const row: Record<string, unknown> = {
    name,
    title: title || null,
    organization: organization || null,
    department: department || null,
    email: email || null,
    phone: phone || null,
    jurisdiction: jurisdiction || null,
    contact_type: contact_type || null,
    city_id: city_id,
    city_name: city_name || null,
    priority,
    status,
    notes: notes || null,
  }
  if (contact_type === "media") {
    row.outlet_platform = outlet_platform || null
    row.primary_beat = primary_beat || null
    row.primary_city = primary_city || "San Francisco"
    row.coverage_cities = coverage_cities.length ? coverage_cities : []
    row.sub_geographies = sub_geographies.length ? sub_geographies : []
  }

  const { data: contact, error } = await db
    .from("prospects")
    .insert(row)
    .select()
    .single() as { data: { id: string } | null; error: Error | null }

  if (error || !contact) {
    console.error("Error creating contact:", error)
    throw new Error("Failed to create contact")
  }

  if (keywords.length > 0) {
    await db.from("prospect_keywords").insert(
      keywords.map((kid: string) => ({ prospect_id: contact.id, keyword_id: kid }))
    )
  }

  if (contact_type === "media" && article_urls.length > 0) {
    for (const url of article_urls) {
      if (url.trim()) {
        await db.from("prospect_article_links").insert({ prospect_id: contact.id, url: url.trim() })
      }
    }
  }

  revalidatePath("/contacts")
  revalidatePath("/")
}

export async function updateContact(id: string, formData: FormData) {
  const db = createClient()

  const contact_type = (formData.get("contact_type") as string) || "city_staff"
  const name = formData.get("name") as string
  const title = formData.get("title") as string | null
  const organization = formData.get("organization") as string | null
  const department = formData.get("department") as string | null
  const email = formData.get("email") as string | null
  const phone = formData.get("phone") as string | null
  const jurisdiction = formData.get("jurisdiction") as string | null
  const cityIdRaw = formData.get("city_id") as string | null
  const city_id = cityIdRaw ? parseInt(cityIdRaw) || null : null
  const city_name = (formData.get("city_name") as string)?.trim() || null
  const outlet_platform = formData.get("outlet_platform") as string | null
  const primary_beat = formData.get("primary_beat") as string | null
  const primary_city = (formData.get("primary_city") as string)?.trim() || null
  const coverage_cities = parseStringArray(formData.get("coverage_cities"))
  const sub_geographies = parseStringArray(formData.get("sub_geographies"))
  const priority = parseInt(formData.get("priority") as string) || 3
  const status = formData.get("status") as string || "active"
  const notes = formData.get("notes") as string | null
  const keywords = JSON.parse((formData.get("keywords") as string) || "[]") as string[]
  const article_urls = parseStringArray(formData.get("article_urls"))

  const row: Record<string, unknown> = {
    name,
    title: title || null,
    organization: organization || null,
    department: department || null,
    email: email || null,
    phone: phone || null,
    jurisdiction: jurisdiction || null,
    contact_type: contact_type || null,
    city_id: city_id,
    city_name: city_name || null,
    priority,
    status,
    notes: notes || null,
  }
  if (contact_type === "media") {
    row.outlet_platform = outlet_platform || null
    row.primary_beat = primary_beat || null
    row.primary_city = primary_city || "San Francisco"
    row.coverage_cities = coverage_cities.length ? coverage_cities : []
    row.sub_geographies = sub_geographies.length ? sub_geographies : []
  }

  const { error } = await db.from("prospects").update(row).eq("id", id)

  if (error) {
    console.error("Error updating contact:", error)
    throw new Error("Failed to update contact")
  }

  await db.from("prospect_keywords").delete().eq("prospect_id", id)
  if (keywords.length > 0) {
    await db
      .from("prospect_keywords")
      .insert(keywords.map((kid: string) => ({ prospect_id: id, keyword_id: kid })))
  }

  await db.from("prospect_article_links").delete().eq("prospect_id", id)
  if (contact_type === "media" && article_urls.length > 0) {
    for (const url of article_urls) {
      if (url.trim()) {
        await db.from("prospect_article_links").insert({ prospect_id: id, url: url.trim() })
      }
    }
  }

  revalidatePath("/contacts")
  revalidatePath("/")
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

// Bulk update city on multiple contacts
export async function bulkUpdateCity(
  contactIds: string[],
  cityId: number | null,
  cityName: string | null
): Promise<{ updated: number; errors: string[] }> {
  const db = createClient()
  const errors: string[] = []
  let updated = 0

  const batchSize = 50
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize)
    for (const id of batch) {
      const { error } = await db
        .from("prospects")
        .update({ city_id: cityId, city_name: cityName })
        .eq("id", id)
      if (error) {
        errors.push(`Contact ${id}: ${error.message}`)
      } else {
        updated++
      }
    }
  }
  revalidatePath("/contacts")
  revalidatePath("/")
  return { updated, errors }
}

// Bulk add keywords to multiple contacts (adds without removing existing)
export async function bulkAddKeywords(
  contactIds: string[],
  keywordIds: string[]
): Promise<{ updated: number; errors: string[] }> {
  const db = createClient()
  const errors: string[] = []
  let updated = 0

  for (const contactId of contactIds) {
    // Fetch existing keyword links to avoid duplicates
    const { data: existing } = await db
      .from("prospect_keywords")
      .select("keyword_id")
      .eq("prospect_id", contactId)
    const existingIds = new Set(
      (existing as { keyword_id: string }[] | null)?.map((r) => r.keyword_id) ?? []
    )
    const newLinks = keywordIds
      .filter((kid) => !existingIds.has(kid))
      .map((kid) => ({ prospect_id: contactId, keyword_id: kid }))

    if (newLinks.length > 0) {
      const { error } = await db.from("prospect_keywords").insert(newLinks)
      if (error) {
        errors.push(`Contact ${contactId}: ${error.message}`)
        continue
      }
    }
    updated++
  }

  revalidatePath("/contacts")
  revalidatePath("/")
  return { updated, errors }
}

// Bulk update contact type on multiple contacts
export async function bulkUpdateType(
  contactIds: string[],
  contactType: string
): Promise<{ updated: number; errors: string[] }> {
  const db = createClient()
  const errors: string[] = []
  let updated = 0

  const batchSize = 50
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize)
    for (const id of batch) {
      const { error } = await db
        .from("prospects")
        .update({ contact_type: contactType })
        .eq("id", id)
      if (error) {
        errors.push(`Contact ${id}: ${error.message}`)
      } else {
        updated++
      }
    }
  }
  revalidatePath("/contacts")
  revalidatePath("/")
  return { updated, errors }
}

/** Check if an email already exists in the prospects table. */
export async function checkDuplicateEmail(
  email: string,
  excludeId?: string
): Promise<{ duplicate: boolean; name?: string }> {
  if (!email?.trim()) return { duplicate: false }
  const db = createClient()
  let query = db
    .from("prospects")
    .select("id, name")
    .ilike("email", email.trim())
    .limit(1)
  if (excludeId) {
    query = query.neq("id", excludeId)
  }
  const { data } = await query
  const rows = Array.isArray(data) ? data : []
  if (rows.length > 0) {
    return { duplicate: true, name: (rows[0] as { name: string }).name }
  }
  return { duplicate: false }
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
  return arr.filter((c: { status?: string }) => (c?.status || "active") === "active")
}

/** Get activity timeline events for a contact. */
export async function getContactActivity(
  contactId: string
): Promise<Array<{ type: string; date: string; detail: string }>> {
  const db = createClient()
  const events: Array<{ type: string; date: string; detail: string }> = []

  // Get contact creation/update dates
  const { data: contact } = await db
    .from("prospects")
    .select("created_at, updated_at, name")
    .eq("id", contactId)
    .single()

  if (contact) {
    const c = contact as { created_at: string; updated_at: string; name: string }
    events.push({
      type: "contact_created",
      date: c.created_at,
      detail: `Contact "${c.name}" was created`,
    })
    if (c.updated_at && c.updated_at !== c.created_at) {
      events.push({
        type: "contact_updated",
        date: c.updated_at,
        detail: `Contact info was updated`,
      })
    }
  }

  // Get send_queue events
  const { data: queueItems } = await db
    .from("send_queue")
    .select("id, status, created_at, sent_at, personalized_subject")
    .eq("prospect_id", contactId)
    .order("created_at", { ascending: false })

  const items = Array.isArray(queueItems) ? queueItems : []
  for (const item of items) {
    const q = item as {
      id: string
      status: string
      created_at: string
      sent_at: string | null
      personalized_subject: string | null
    }
    events.push({
      type: "draft_generated",
      date: q.created_at,
      detail: `Draft generated: "${q.personalized_subject || "(No subject)"}"`,
    })
    if (q.status === "sent" && q.sent_at) {
      events.push({
        type: "email_sent",
        date: q.sent_at,
        detail: `Email sent: "${q.personalized_subject || "(No subject)"}"`,
      })
    }
  }

  // Sort chronologically (newest first)
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return events
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
  city_id: number | null
  city_name: string | null
  priority: number
  notes: string | null
  keywordIds: string[]
  contact_type?: string
  outlet_platform?: string | null
  primary_beat?: string | null
  primary_city?: string | null
  coverage_cities?: string | null
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
    
    const contactsToInsert = batch.map(c => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      title: c.title,
      organization: c.organization,
      department: c.department,
      jurisdiction: c.jurisdiction,
      city_id: c.city_id,
      city_name: c.city_name,
      contact_type: (c as any).contact_type || "city_staff",
      priority: c.priority,
      status: 'active' as const,
      notes: c.notes,
    }))


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


  revalidatePath('/contacts')
  revalidatePath('/')

  return { success, failed, errors }
}
