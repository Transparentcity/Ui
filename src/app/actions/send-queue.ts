"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { ThrottleSettings, SendQueueItem, Contact, TemplateWithVariations, Anomaly } from "@/lib/types"
import { prepareQueueItems, DEFAULT_THROTTLE_SETTINGS } from "@/lib/send-queue"

export async function getThrottleSettings(campaignId: string) {
  const db = createClient()
  
  const { data, error } = await db
    .from("campaign_throttle_settings")
    .select("*")
    .eq("campaign_id", campaignId)
    .single()
  
  if (error && (error as any).code !== "PGRST116") {
    console.error("[v0] Error fetching throttle settings:", error)
  }
  
  return data || null
}

export async function saveThrottleSettings(campaignId: string, settings: Partial<ThrottleSettings>) {
  const db = await createClient()
  
  const { data: existing } = await db
    .from("campaign_throttle_settings")
    .select("id")
    .eq("campaign_id", campaignId)
    .single() as { data: { id: string } | null; error: Error | null }
  
  if (existing) {
    const { error } = await db
      .from("campaign_throttle_settings")
      .update({
        emails_per_minute: settings.emails_per_minute,
        emails_per_hour: settings.emails_per_hour,
        emails_per_day: settings.emails_per_day,
        min_delay_seconds: settings.min_delay_seconds,
        max_delay_seconds: settings.max_delay_seconds,
        randomize_delay: settings.randomize_delay,
        active_hours_start: settings.active_hours_start,
        active_hours_end: settings.active_hours_end,
        active_days: settings.active_days,
        respect_timezone: settings.respect_timezone,
      })
      .eq("id", existing.id)
    
    if (error) {
      console.error("[v0] Error updating throttle settings:", error)
      throw new Error("Failed to update throttle settings")
    }
  } else {
    const { error } = await db
      .from("campaign_throttle_settings")
      .insert({
        campaign_id: campaignId,
        ...settings,
      })
    
    if (error) {
      console.error("[v0] Error creating throttle settings:", error)
      throw new Error("Failed to create throttle settings")
    }
  }
  
  revalidatePath("/campaigns")
  revalidatePath("/send-queue")
}

export async function getSendQueue(campaignId?: string) {
  const db = createClient()
  
  let query = db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(id, name, email, phone, organization, department)
    `)
    .order("scheduled_for", { ascending: true })
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error("[v0] Error fetching send queue:", error)
    return []
  }
  
  return data as (SendQueueItem & { prospect: Contact })[]
}

export async function getQueueStats(campaignId?: string) {
  const db = createClient()
  
  let query = db
    .from("send_queue")
    .select("status")
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }
  
  const { data, error } = await query
  
  if (error || !data) {
    console.error("[v0] Error fetching queue stats:", error)
    return { total: 0, pending_review: 0, queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 }
  }
  
  const items = Array.isArray(data) ? data : []
  return {
    total: items.length,
    pending_review: items.filter((d: any) => d.status === "pending_review").length,
    queued: items.filter((d: any) => d.status === "queued").length,
    processing: items.filter((d: any) => d.status === "processing").length,
    sent: items.filter((d: any) => d.status === "sent").length,
    failed: items.filter((d: any) => d.status === "failed").length,
    cancelled: items.filter((d: any) => d.status === "cancelled").length,
  }
}

export async function addToQueue(
  campaignId: string,
  templateId: string,
  contactIds: string[],
  anomalyId?: string,
  /** When anomalyId is set, caller can pass anomaly from Platform API (no DB fetch). */
  anomaly?: Anomaly | null
) {
  try {
    const db = createClient()
    
    console.log("[v0] addToQueue: Fetching template:", templateId)
    
    // Fetch template (simple query without complex joins)
    const { data: template, error: templateError } = await db
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single() as { data: { id: string; name: string; subject: string | null; body: string } | null; error: Error | null }
    
    if (templateError || !template) {
      console.error("[v0] Error fetching template:", templateError)
      throw new Error("Failed to fetch template: " + (templateError?.message || "not found"))
    }
    
    console.log("[v0] addToQueue: Template found:", template.name)
    
    // Fetch subject variations separately
    const { data: subjectVariations } = await db
      .from("subject_variations")
      .select("*")
      .eq("template_id", templateId)
    
    // Fetch template variations separately  
    const { data: templateVariations } = await db
      .from("template_variations")
      .select("*")
      .eq("template_id", templateId)
    
    // Build the template with variations
    const templateWithVariations: TemplateWithVariations = {
      ...(template as any),
      subject_variations: (subjectVariations as any[]) || [],
      variations: (templateVariations as any[]) || [],
      tone_profile: null, // Tone profiles are optional
      variation_enabled: true,
    }
    
    console.log("[v0] addToQueue: Fetching contacts:", contactIds.length)
    
    // Fetch contacts
    const { data: contacts, error: contactsError } = await db
      .from("prospects")
      .select("*")
      .in("id", contactIds)
    
    if (contactsError) {
      console.error("[v0] Error fetching contacts:", contactsError)
      throw new Error("Failed to fetch contacts: " + contactsError.message)
    }
    
    const contactsArray = Array.isArray(contacts) ? contacts : []
    if (contactsArray.length === 0) {
      throw new Error("No contacts found")
    }
    
    console.log("[v0] addToQueue: Found contacts:", contactsArray.length)
    
    // Use anomaly from caller (Platform API). from Platform API fetch.
    const anomalyResolved: Anomaly | null = anomalyId && anomaly ? anomaly : null
    
    // Get throttle settings (may not exist yet - that's ok, we use defaults)
    const { data: throttleSettingsArray } = await db
      .from("campaign_throttle_settings")
      .select("*")
      .eq("campaign_id", campaignId)
      .limit(1)
    
    const throttleSettings = Array.isArray(throttleSettingsArray) ? throttleSettingsArray[0] : null
    
    console.log("[v0] addToQueue: Preparing queue items...")
    
    // Prepare queue items with variations
    const queueItems = prepareQueueItems({
      campaignId,
      template: templateWithVariations,
      contacts: contactsArray as Contact[],
      anomaly: anomalyResolved,
      settings: throttleSettings || DEFAULT_THROTTLE_SETTINGS,
    })
    
    console.log("[v0] addToQueue: Prepared items:", queueItems.length)
    
    // Insert into queue
    const { error } = await db
      .from("send_queue")
      .insert(queueItems)
    
    if (error) {
      console.error("[v0] Error adding to queue:", error)
      throw new Error("Failed to add to queue: " + error.message)
    }
    
    console.log("[v0] addToQueue: Successfully added to queue")
    
    revalidatePath("/send-queue")
    revalidatePath("/campaigns")
    
    return { added: queueItems.length }
  } catch (error) {
    console.error("[v0] addToQueue error:", error)
    throw error
  }
}

export async function updateQueueItemStatus(id: string, status: string, errorMessage?: string) {
  const db = await createClient()
  
  const updateData: Record<string, unknown> = { status }
  
  if (status === "sent") {
    updateData.sent_at = new Date().toISOString()
  }
  
  if (errorMessage) {
    updateData.error_message = errorMessage
  }
  
  const { error } = await db
    .from("send_queue")
    .update(updateData)
    .eq("id", id)
  
  if (error) {
    console.error("[v0] Error updating queue item:", error)
    throw new Error("Failed to update queue item")
  }
  
  revalidatePath("/send-queue")
}

export async function cancelQueueItems(ids: string[]) {
  const db = await createClient()
  
  const { error } = await db
    .from("send_queue")
    .update({ status: "cancelled" })
    .in("id", ids)
    .eq("status", "queued")
  
  if (error) {
    console.error("[v0] Error cancelling queue items:", error)
    throw new Error("Failed to cancel queue items")
  }
  
  revalidatePath("/send-queue")
}

export async function clearQueue(campaignId?: string, status?: string) {
  const db = await createClient()
  
  let query = db.from("send_queue").delete()
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }
  
  if (status) {
    query = query.eq("status", status)
  }
  
  const { error } = await query
  
  if (error) {
    console.error("[v0] Error clearing queue:", error)
    throw new Error("Failed to clear queue")
  }
  
  revalidatePath("/send-queue")
}

export async function retryFailedItems(campaignId?: string) {
  const db = await createClient()
  
  let query = db
    .from("send_queue")
    .update({ 
      status: "queued", 
      error_message: null,
      scheduled_for: new Date().toISOString()
    })
    .eq("status", "failed")
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }
  
  const { error } = await query
  
  if (error) {
    console.error("[v0] Error retrying failed items:", error)
    throw new Error("Failed to retry items")
  }
  
  revalidatePath("/send-queue")
}

// Alias for campaigns manager - queues messages for all provided contacts
export async function queueCampaignMessages(
  campaignId: string,
  templateId: string,
  contactIds: string[],
  anomaliesFromApi?: Anomaly[]
) {
  // Use AI generation with anomalies instead of just copying template
  return regenerateCampaign(campaignId, templateId, contactIds, true, anomaliesFromApi)
}

// Update a queue item's content (subject/body)
export async function updateQueueItemContent(
  id: string,
  updates: { personalized_subject?: string; personalized_body?: string }
) {
  const db = createClient()
  
  const { error } = await db
    .from("send_queue")
    .update(updates)
    .eq("id", id)
  
  if (error) {
    console.error("[v0] Error updating queue item content:", error)
    throw new Error("Failed to update message")
  }
  
  revalidatePath("/send-queue")
}

// Approve messages and schedule them automatically using throttle settings
export async function approveQueueItems(ids: string[]) {
  const db = createClient()
  
  // Fetch the items to get campaign IDs
  const { data: items, error: fetchError } = await db
    .from("send_queue")
    .select("id, campaign_id")
    .in("id", ids)
    .eq("status", "pending_review")
  
  const itemsArray = Array.isArray(items) ? items : []
  if (fetchError || itemsArray.length === 0) {
    console.error("[v0] Error fetching queue items:", fetchError)
    throw new Error("Failed to fetch messages to approve")
  }
  
  // Get unique campaign IDs
  const campaignIds = [...new Set(itemsArray.map((i: any) => i.campaign_id).filter(Boolean))]
  
  // Fetch throttle settings for campaigns (if any)
  let throttleSettings: Record<string, any> = {}
  if (campaignIds.length > 0) {
    const { data: settings } = await db
      .from("campaign_throttle_settings")
      .select("*")
      .in("campaign_id", campaignIds)
    
    const settingsArr = Array.isArray(settings) ? settings : []
    for (const s of settingsArr) {
      throttleSettings[(s as any).campaign_id] = s
    }
  }
  
  // Count currently queued items to determine next slot
  const { data: queuedItems } = await db
    .from("send_queue")
    .select("scheduled_for")
    .eq("status", "queued")
    .order("scheduled_for", { ascending: false })
    .limit(1)
  
  // Calculate scheduled times based on throttle settings
  const defaultSettings = DEFAULT_THROTTLE_SETTINGS
  let nextTime = new Date()
  
  // If there are already queued items, start after the last one
  const queuedArr = Array.isArray(queuedItems) ? queuedItems : []
  if (queuedArr.length > 0 && (queuedArr[0] as any).scheduled_for) {
    const lastScheduled = new Date((queuedArr[0] as any).scheduled_for)
    if (lastScheduled > nextTime) {
      nextTime = lastScheduled
    }
  }
  
  // Calculate schedule for each item
  const updates = itemsArray.map((item: any, index: number) => {
    const settings = item.campaign_id ? throttleSettings[item.campaign_id] : null
    const minDelay = settings?.min_delay_seconds || defaultSettings.min_delay_seconds
    const maxDelay = settings?.max_delay_seconds || defaultSettings.max_delay_seconds
    const randomizeDelay = settings?.randomize_delay ?? defaultSettings.randomize_delay
    
    // Add delay for each item
    if (index > 0) {
      const delay = randomizeDelay 
        ? minDelay + Math.random() * (maxDelay - minDelay)
        : minDelay
      nextTime = new Date(nextTime.getTime() + delay * 1000)
    }
    
    return {
      id: item.id,
      scheduled_for: nextTime.toISOString(),
    }
  })
  
  // Update each item with its scheduled time
  for (const update of updates) {
    const { error } = await db
      .from("send_queue")
      .update({ 
        status: "queued",
        scheduled_for: update.scheduled_for
      })
      .eq("id", update.id)
    
    if (error) {
      console.error("[v0] Error approving queue item:", update.id, error)
    }
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
}

// Reject/delete pending review items
export async function rejectQueueItems(ids: string[]) {
  const db = createClient()
  
  const { error } = await db
    .from("send_queue")
    .delete()
    .in("id", ids)
    .eq("status", "pending_review")
  
  if (error) {
    console.error("[v0] Error rejecting queue items:", error)
    throw new Error("Failed to reject messages")
  }
  
  revalidatePath("/send-queue")
}

// Regenerate specific queue items with AI
/** anomaliesFromApi: when provided, use these (from Platform API) instead of DB. from Platform API. */
export async function regenerateQueueItems(ids: string[], anomaliesFromApi?: Anomaly[]) {
  const db = createClient()
  
  // Fetch the items with their contacts
  const { data: items, error: fetchError } = await db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(*)
    `)
    .in("id", ids)
    .eq("status", "pending_review")
  
  const itemsArr = Array.isArray(items) ? items : []
  if (fetchError || itemsArr.length === 0) {
    console.error("[v0] Error fetching queue items for regeneration:", fetchError)
    throw new Error("Failed to fetch messages to regenerate")
  }
  
  console.log("[v0] Regenerating", itemsArr.length, "queue items with AI")
  
  // Group items by campaign to use appropriate template
  const campaignIds = [...new Set(itemsArr.map((i: any) => i.campaign_id).filter(Boolean))]
  
  // Fetch templates for campaigns
  let campaignTemplates: Record<string, any> = {}
  if (campaignIds.length > 0) {
    const { data: campaigns } = await db
      .from("campaigns")
      .select("id, template_id")
      .in("id", campaignIds)
    
    const campaignsArr = Array.isArray(campaigns) ? campaigns : []
    if (campaignsArr.length > 0) {
      const templateIds = campaignsArr.map((c: any) => c.template_id).filter(Boolean)
      if (templateIds.length > 0) {
        const { data: templates } = await db
          .from("templates")
          .select("*")
          .in("id", templateIds)
        
        const templatesArr = Array.isArray(templates) ? templates : []
        for (const campaign of campaignsArr) {
          const template = templatesArr.find((t: any) => t.id === (campaign as any).template_id)
          if (template) {
            campaignTemplates[(campaign as any).id] = template
          }
        }
      }
    }
  }
  
  // Use anomalies from caller (Platform API). from Platform API.
  const anomalies: any[] = anomaliesFromApi ?? []
  if (anomalies.length > 0) {
    console.log("[v0] Using", anomalies.length, "anomalies for regeneration (from API)")
    // Count citywide anomalies
    const citywideCount = anomalies.filter(a => 
      a.is_citywide === true || a.district === 0 || a.district_label?.toLowerCase() === 'citywide'
    ).length
    console.log("[v0] Citywide anomalies available:", citywideCount)
    // Show sample
    if (anomalies[0]) {
      console.log("[v0] Sample anomaly:", JSON.stringify({
        district: anomalies[0].district,
        district_label: anomalies[0].district_label,
        is_citywide: anomalies[0].is_citywide,
        metric_name: anomalies[0].metric_name?.substring(0, 30)
      }))
    }
  }
  
  // Generate new content for each item
  const { generateText } = await import("ai")
  
  for (const item of itemsArr) {
    const contact = item.prospect
    if (!contact) continue
    
    const template = item.campaign_id ? campaignTemplates[item.campaign_id] : null
    const firstName = contact.name?.split(" ")[0] || "there"
    
    // Find matching anomalies for this contact
    // Support both 'district' and 'jurisdiction' field names
    const contactDistrict = (contact.district || contact.jurisdiction || "").toString().toLowerCase().trim()
    const matchedAnomalies = anomalies.filter(anomaly => {
      if (!anomaly.district_label || !contactDistrict) return false
      const anomalyDistrict = anomaly.district_label.toLowerCase().trim()
      const contactNum = contactDistrict.replace(/\D/g, '')
      const anomalyNum = anomalyDistrict.replace(/\D/g, '')
      return contactNum === anomalyNum
    }).slice(0, 3)
    
    // Add citywide anomalies (check both is_citywide flag and district === 0)
    const citywideAnomalies = anomalies.filter(a => {
      if (matchedAnomalies.includes(a)) return false
      // Check for citywide: is_citywide flag OR district === 0 OR district_label is "Citywide"
      return a.is_citywide === true || 
             a.district === 0 || 
             a.district_label?.toLowerCase() === 'citywide'
    }).slice(0, 2)
    const allAnomalies = [...matchedAnomalies, ...citywideAnomalies].slice(0, 4)
    
    // Debug logging
    console.log(`[v0] Contact ${contact.name}: district matches=${matchedAnomalies.length}, citywide=${citywideAnomalies.length}, total=${allAnomalies.length}`)
    
    // Build prompt for regeneration - use metric_name and sanitize
    const anomalyContext = allAnomalies.length > 0
      ? allAnomalies.map(a => {
          const name = sanitizeForJSON(a.metric_name || a.title) || 'Unknown'
          const change = a.pct_change ? ` (${a.pct_change > 0 ? '+' : ''}${a.pct_change.toFixed(1)}% change)` : ''
          return `- ${name}${change} - Severity: ${a.severity || 'medium'}`
        }).join("\n")
      : "No specific anomalies to mention"
    
    const systemPrompt = `You are an expert at writing professional government correspondence. Generate a unique, personalized email.

CRITICAL RULES:
1. Use the actual first name provided - never use placeholders
2. Write natural sentences with actual data from anomalies if provided
3. Keep the tone professional but personable
4. The email should be concise but informative

Return a JSON object with "subject" and "body" fields only.`

    // Sanitize contact and template data
    const cleanName = sanitizeForJSON(contact.name) || 'Unknown'
    const cleanFirstName = sanitizeForJSON(firstName)
    const cleanTitle = sanitizeForJSON(contact.title) || 'N/A'
    const cleanOrg = sanitizeForJSON(contact.organization) || 'N/A'
    const cleanJurisdiction = sanitizeForJSON(contact.district || contact.jurisdiction) || 'N/A'
    const cleanTemplateSubject = template ? sanitizeForJSON(template.subject) || 'Update from Transparent City' : ''
    
    const userPrompt = `Generate a new email for:
- Name: ${cleanName} (use FIRST NAME: ${cleanFirstName})
- Title: ${cleanTitle}
- Organization: ${cleanOrg}
- Jurisdiction: ${cleanJurisdiction}

${template ? `Base style on this template subject: ${cleanTemplateSubject}` : ''}

Anomalies to potentially reference:
${anomalyContext}

Generate a unique email as JSON with "subject" and "body".`

    try {
      const { createAnthropic } = await import("@ai-sdk/anthropic")
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
      
      const result = await generateText({
        model: anthropic("claude-sonnet-4-20250514"),
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 2000,
      } as any)
      
      // Parse the response
      const text = result.text
      const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        // Update the queue item with new content
        await db
          .from("send_queue")
          .update({
            personalized_subject: parsed.subject,
            personalized_body: parsed.body,
            variation_seed: Math.floor(Math.random() * 1000000),
          })
          .eq("id", item.id)
        
        console.log("[v0] Regenerated message for:", contact.name)
      }
    } catch (genError) {
      console.error("[v0] Error generating content for:", contact.name, genError)
    }
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
  
  return { regenerated: itemsArr.length }
}

// Delete queue items by IDs (any status)
export async function deleteQueueItems(ids: string[]) {
  const db = createClient()
  
  const { error } = await db
    .from("send_queue")
    .delete()
    .in("id", ids)
  
  if (error) {
    console.error("[v0] Error deleting queue items:", error)
    throw new Error("Failed to delete messages")
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
}

// Delete all queue items matching filters
export async function deleteAllQueueItems(options?: { 
  status?: string 
  campaignId?: string 
}) {
  const db = createClient()
  
  let query = db.from("send_queue").delete()
  
  if (options?.status) {
    query = query.eq("status", options.status)
  }
  
  if (options?.campaignId) {
    query = query.eq("campaign_id", options.campaignId)
  }
  
  // Safety: require at least one filter to prevent accidental deletion of everything
  if (!options?.status && !options?.campaignId) {
    throw new Error("Must specify status or campaignId filter")
  }
  
  const { error } = await query
  
  if (error) {
    console.error("[v0] Error deleting all queue items:", error)
    throw new Error("Failed to delete messages")
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
}

// Regenerate campaign with AI - clear pending/queued messages and generate new ones with Claude
/** anomaliesFromApi: optional; when provided, used for matching (from Platform API). from Platform API. */
export async function regenerateCampaign(
  campaignId: string,
  templateId: string,
  contactIds: string[],
  clearExisting: boolean = true,
  anomaliesFromApi?: Anomaly[]
) {
  try {
    console.log("========================================")
    console.log("[v0] REGENERATE CAMPAIGN WITH AI STARTED")
    console.log("========================================")
    console.log("[v0] Campaign:", campaignId)
    console.log("[v0] Template:", templateId)
    console.log("[v0] Contacts:", contactIds.length)
    console.log("[v0] Clear existing:", clearExisting)
    
    const db = createClient()
    
    // Optionally clear existing queued and pending_review messages for this campaign
    if (clearExisting) {
      console.log("[v0] Clearing existing queue items for campaign:", campaignId)
      const { error: deleteError } = await db
        .from("send_queue")
        .delete()
        .eq("campaign_id", campaignId)
        .in("status", ["queued", "pending_review"])
      
      if (deleteError) {
        console.error("[v0] Error clearing existing queue items:", deleteError)
        throw new Error("Failed to clear existing messages: " + deleteError.message)
      }
      console.log("[v0] Successfully cleared existing queue items")
    }
    
    // Fetch the template to use as sample email
    const { data: template, error: templateError } = await db
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single() as { data: { id: string; body: string; subject: string | null } | null; error: Error | null }
    
    if (templateError || !template) {
      console.error("[v0] Error fetching template:", templateError)
      throw new Error("Failed to fetch template")
    }
    
    // Generate emails using AI
    console.log("[v0] Generating emails with AI...")
    const result = await generateEmailsWithAI(
      campaignId,
      template.body,
      template.subject || "Update from Transparent City",
      contactIds,
      true, // include anomalies
      anomaliesFromApi
    )
    
    console.log("[v0] Successfully generated and queued emails:", result)
    
    revalidatePath("/send-queue")
    revalidatePath("/campaigns")
    
    return result
  } catch (error) {
    console.error("[v0] Error regenerating campaign:", error)
    throw error
  }
}

// Helper to sanitize strings for JSON - removes invalid Unicode surrogates and problematic chars
function sanitizeForJSON(str: string | null | undefined): string {
  if (!str) return ''
  // Remove invalid Unicode surrogates (unpaired high/low surrogates)
  // Remove emoji and other problematic characters
  return str
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '') // Unpaired high surrogates
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // Unpaired low surrogates
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
    .replace(/[^\x00-\x7F]/g, (char) => {
      // Keep common extended Latin, but remove other non-ASCII
      const code = char.charCodeAt(0)
      if (code >= 0x00C0 && code <= 0x024F) return char // Extended Latin
      if (code >= 0x2000 && code <= 0x206F) return ' ' // General punctuation -> space
      return '' // Remove emoji, symbols, etc.
    })
    .trim()
}

// Helper function to generate emails with AI (Claude)
/** anomaliesFromApi: when provided, use these (from Platform API) instead of DB. from Platform API. */
async function generateEmailsWithAI(
  campaignId: string,
  sampleEmail: string,
  sampleSubject: string,
  contactIds: string[],
  includeAnomalies: boolean = true,
  anomaliesFromApi?: Anomaly[]
) {
  const db = createClient()
  
  // Fetch contacts with their keywords
  const { data: contacts, error: contactsError } = await db
    .from("prospects")
    .select("*")
    .in("id", contactIds)
    .eq("status", "active")

  const contactsArr = Array.isArray(contacts) ? contacts : []
  if (contactsError || contactsArr.length === 0) {
    console.error("[v0] Error fetching contacts:", contactsError)
    throw new Error("Failed to fetch contacts")
  }
  
  // Fetch contact keywords
  const { data: contactKeywords } = await db
    .from("prospect_keywords")
    .select("prospect_id, keyword_id")
    .in("prospect_id", contactIds)
  
  // Build contact keyword map
  const contactKeywordsArr = Array.isArray(contactKeywords) ? contactKeywords : []
  const contactKeywordMap: Record<string, string[]> = {}
  for (const ck of contactKeywordsArr) {
    if (!contactKeywordMap[(ck as any).prospect_id]) {
      contactKeywordMap[(ck as any).prospect_id] = []
    }
    contactKeywordMap[(ck as any).prospect_id].push((ck as any).keyword_id)
  }

  // Use anomalies from caller (Platform API). from Platform API.
  const anomalies: any[] = includeAnomalies && anomaliesFromApi ? anomaliesFromApi : []
  const anomalyKeywordMap: Record<string, string[]> = {} // Platform has no anomaly_keywords
  
  console.log("[v0] ========================================")
  console.log("[v0] MATCHING ANOMALIES TO CONTACTS")
  console.log("[v0] ========================================")
  console.log("[v0] Total contacts:", contactsArr.length)
  console.log("[v0] Total anomalies (from API):", anomalies.length)
  
  if (anomalies.length > 0) {
    console.log("[v0] Sample anomaly:", JSON.stringify({
      id: anomalies[0].id,
      metric_name: anomalies[0].metric_name,
      district_label: anomalies[0].district_label,
      is_citywide: anomalies[0].is_citywide,
      pct_change: anomalies[0].pct_change
    }))
  }

  // Match anomalies to contacts by: 1) District, 2) Keywords, 3) Citywide
  const contactAnomalyMap: Record<string, any[]> = {}
  
  for (let contactIdx = 0; contactIdx < contactsArr.length; contactIdx++) {
    const contact = contactsArr[contactIdx] as any
    // Support both 'district' and 'jurisdiction' field names
    const contactDistrict = (contact.district || contact.jurisdiction || "").toString().toLowerCase().trim()
    const contactKwIds = contactKeywordMap[contact.id] || []
    
    // 1. District matches (highest priority)
    // Contact has "1" or "11", anomaly has "District 1" or "District 11" - extract numbers to compare
    const districtMatches = anomalies.filter(anomaly => {
      if (!anomaly.district_label || !contactDistrict) return false
      const anomalyDistrict = anomaly.district_label.toLowerCase().trim()
      const contactNum = contactDistrict.replace(/\D/g, '')
      const anomalyNum = anomalyDistrict.replace(/\D/g, '')
      return contactNum === anomalyNum
    })
    
    // 2. Keyword matches (if contact has keywords)
    const keywordMatches = anomalies.filter(anomaly => {
      if (districtMatches.includes(anomaly)) return false
      const anomalyKwIds = anomalyKeywordMap[anomaly.id] || []
      return anomalyKwIds.some(kwId => contactKwIds.includes(kwId))
    })
    
    // 3. Citywide anomalies (fallback) - check is_citywide flag OR district === 0 OR district_label is "Citywide"
    const citywideMatches = anomalies.filter(anomaly => {
      if (districtMatches.includes(anomaly) || keywordMatches.includes(anomaly)) return false
      return anomaly.is_citywide === true || 
             anomaly.district === 0 || 
             anomaly.district_label?.toLowerCase() === 'citywide'
    })
    
    // Combine: district first, then keywords, then citywide - max 4 total
    const combined = [...districtMatches, ...keywordMatches, ...citywideMatches]
    contactAnomalyMap[contact.id] = combined.slice(0, 4)
    
    // Log first few contacts with details
    if (contactIdx < 3) {
      console.log(`[v0] Contact "${contact.name}" (district: "${contact.district || contact.jurisdiction}"):`)
      console.log(`[v0]   - District matches: ${districtMatches.length}`)
      console.log(`[v0]   - Keyword matches: ${keywordMatches.length}`)
      console.log(`[v0]   - Citywide matches: ${citywideMatches.length}`)
      if (combined.length > 0) {
        console.log(`[v0]   - First anomaly: ${combined[0].metric_name} (${combined[0].pct_change?.toFixed(1)}% change)`)
      }
    }
  }
  
  // Summary
  const contactsWithAnomalies = Object.values(contactAnomalyMap).filter(a => a.length > 0).length
  console.log(`[v0] Summary: ${contactsWithAnomalies}/${contactsArr.length} contacts have matched anomalies`)

  // Build prompt for Claude
  const getFirstName = (fullName: string): string => {
    if (!fullName) return "there"
    return fullName.split(" ")[0]
  }

  const formatAnomalyForPrompt = (anomaly: any, isCitywide: boolean): string => {
    // Build location description - sanitize all string values
    const districtLabel = sanitizeForJSON(anomaly.district_label)
    const groupValue = sanitizeForJSON(anomaly.group_value)
    
    const location = isCitywide 
      ? "citywide" 
      : districtLabel 
        ? `in ${districtLabel}` 
        : groupValue 
          ? `in ${groupValue}`
          : "local"
    
    // Calculate the change direction and magnitude
    const pctChange = anomaly.pct_change || 0
    const direction = pctChange > 0 ? "increased" : pctChange < 0 ? "decreased" : "unchanged"
    const magnitude = Math.abs(pctChange).toFixed(1)
    
    // Build a meaningful title from metric name and context - sanitize to remove emoji
    const metricName = sanitizeForJSON(anomaly.metric_name) || 'Unknown Metric'
    const groupContext = groupValue ? ` (${groupValue})` : ''
    const category = sanitizeForJSON(anomaly.metric_category) || 'general'
    
    return `
  - ANOMALY: "${metricName}${groupContext}"
    - Location: ${location}
    - Severity: ${anomaly.severity || 'medium'}
    - Change: ${direction} by ${magnitude}%
    - Recent Value: ${anomaly.recent_mean?.toFixed(1) || 'N/A'}
    - Previous Average: ${anomaly.comparison_mean?.toFixed(1) || 'N/A'}
    - Category: ${category}
    - ID: ${anomaly.id}`
  }

  const contactDescriptions = contactsArr.map((contact: any) => {
    const contactName = sanitizeForJSON(contact.name) || 'Unknown'
    const firstName = getFirstName(contactName)
    const matchedAnomalies = contactAnomalyMap[contact.id] || []
    
    const districtAnomalies = matchedAnomalies.filter((a: any) => !a.is_citywide)
    const citywideAnomalies = matchedAnomalies.filter((a: any) => a.is_citywide)

    const anomalyDescriptions = [
      ...districtAnomalies.map((a: any) => formatAnomalyForPrompt(a, false)),
      ...citywideAnomalies.map((a: any) => formatAnomalyForPrompt(a, true)),
    ].join("\n")

    return `
=== CONTACT ===
Full Name: ${contactName}
FIRST NAME TO USE: ${firstName}
Title: ${sanitizeForJSON(contact.title) || "N/A"}
Organization: ${sanitizeForJSON(contact.organization) || "N/A"}
Department: ${sanitizeForJSON(contact.department) || "N/A"}
Jurisdiction/District: ${sanitizeForJSON(contact.district || contact.jurisdiction) || "N/A"}
Contact ID: ${contact.id}

${matchedAnomalies.length > 0 ? `ANOMALIES TO INCLUDE:
${anomalyDescriptions}

Anomaly IDs: ${matchedAnomalies.map((a: any) => a.id).join(", ")}` : "No matching anomalies for this contact"}
`
  }).join("\n---\n")

  const systemPrompt = `You are an expert at writing professional government correspondence for Transparent City, a civic data platform that detects anomalies in city data.

UNDERSTANDING THE DATA:
- Each anomaly has a "Recent Value" and "Previous Average" showing what changed
- The "Change" percentage shows the magnitude (e.g., "increased by 33.3%" means recent is 33% higher than the historical average)
- Location tells you if it's district-specific or citywide
- Use the metric name (like "Narcotics Convictions" or "Business Location Openings") to write about the topic naturally

CRITICAL RULES:
1. SUBJECT: Include the contact's FIRST NAME and a specific finding. Example: "Connie - 33% spike in Hayes Valley incidents"
2. FIRST NAME: ALWAYS use the actual first name (e.g., "Hi Connie,"). NEVER use placeholders like [FIRST NAME].
3. ANOMALIES: Convert the data into natural sentences. Example: "In Hayes Valley, we detected 6 incidents this week compared to an average of 4.5—a 33% increase."
4. Each email MUST be unique - vary structure, word choice, and phrasing.
5. NEVER use placeholders like [ANOMALY], [FIRST NAME], {{name}}, [Recent Value], etc. Use the ACTUAL values provided.
6. If a contact has no anomalies, write a general update email without specific data points.

Return valid JSON with this structure:
{
  "emails": [
    {
      "subject": "Catchy subject with first name and specific number",
      "body": "Full email with real names and real data converted to readable sentences",
      "contactId": "contact-id",
      "anomalyIds": ["list-of-anomaly-ids"]
    }
  ]
}`

  // Sanitize the template content to remove invalid Unicode
  const cleanSubject = sanitizeForJSON(sampleSubject)
  const cleanBody = sanitizeForJSON(sampleEmail)
  
  const userPrompt = `Sample email to base variations on:

SUBJECT: ${cleanSubject}

BODY:
${cleanBody}

---

Generate unique emails for each contact below. Use their REAL first name and REAL anomaly data:

${contactDescriptions}

Generate ${contactsArr.length} unique emails as JSON.`

  // Call Claude API
  const { generateText } = await import("ai")
  const { createAnthropic } = await import("@ai-sdk/anthropic")
  
  console.log("[v0] ========================================")
  console.log("[v0] CALLING CLAUDE API")
  console.log("[v0] ========================================")
  console.log("[v0] ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY)
  console.log("[v0] API key prefix:", process.env.ANTHROPIC_API_KEY?.substring(0, 10) + "...")
  
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
  
  console.log("[v0] Prompt length:", userPrompt.length, "chars")
  console.log("[v0] Contacts in prompt:", contactsArr.length)
  
  const result = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 8000,
  } as any)
  
  console.log("[v0] ========================================")
  console.log("[v0] CLAUDE RESPONSE RECEIVED")
  console.log("[v0] ========================================")
  console.log("[v0] Response length:", result.text?.length || 0, "chars")
  console.log("[v0] First 500 chars:", result.text?.substring(0, 500))

  // Parse the response
  let generatedEmails: any[] = []
  try {
    // Extract JSON from the response
    const text = result.text
    console.log("[v0] Looking for JSON in response...")
    const jsonMatch = text.match(/\{[\s\S]*"emails"[\s\S]*\}/)
    if (jsonMatch) {
      console.log("[v0] Found JSON, parsing...")
      const parsed = JSON.parse(jsonMatch[0])
      generatedEmails = parsed.emails || []
      console.log("[v0] Parsed", generatedEmails.length, "emails from response")
      if (generatedEmails.length > 0) {
        console.log("[v0] Sample email:", JSON.stringify({
          subject: generatedEmails[0].subject?.substring(0, 50),
          bodyPreview: generatedEmails[0].body?.substring(0, 100),
          contactId: generatedEmails[0].contactId,
          anomalyIds: generatedEmails[0].anomalyIds
        }))
      }
    } else {
      console.log("[v0] No JSON found in response! Raw text:", text.substring(0, 1000))
    }
  } catch (parseError) {
    console.error("[v0] Error parsing AI response:", parseError)
    console.log("[v0] Raw response:", result.text?.substring(0, 2000))
    throw new Error("Failed to parse AI-generated emails")
  }

  if (generatedEmails.length === 0) {
    console.error("[v0] No emails were generated! Full response:", result.text)
    throw new Error("No emails were generated")
  }
  
  console.log("[v0] ========================================")
  console.log("[v0] QUEUING", generatedEmails.length, "EMAILS")
  console.log("[v0] ========================================")

  // Queue the generated emails
  const queueItems = generatedEmails.map((email: any) => ({
    campaign_id: campaignId,
    prospect_id: email.contactId,
    channel: "email" as const,
    personalized_subject: email.subject,
    personalized_body: email.body,
    anomaly_snippet: email.anomalyIds?.length > 0 
      ? `Anomaly IDs: ${email.anomalyIds.join(", ")}`
      : null,
    status: "pending_review" as const,
    priority: 5,
    variation_seed: Math.floor(Math.random() * 1000000),
    scheduled_for: null,
  }))

  const { error: insertError } = await db
    .from("send_queue")
    .insert(queueItems)

  if (insertError) {
    console.error("[v0] Error inserting queue items:", insertError)
    throw new Error("Failed to queue generated emails")
  }

  // Anomaly crm_status is updated via Platform API.

  return { added: generatedEmails.length }
}

// Schedule queued items (update scheduled_for time)
export async function scheduleQueueItems(
  ids: string[],
  scheduledFor: string
) {
  const db = createClient()
  
  const { error } = await db
    .from("send_queue")
    .update({ 
      scheduled_for: scheduledFor
    })
    .in("id", ids)
    .eq("status", "queued")
  
  if (error) {
    console.error("[v0] Error scheduling queue items:", error)
    throw new Error("Failed to schedule messages")
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
}

// Send items immediately (set scheduled_for to now)
export async function sendNowQueueItems(ids: string[]) {
  const db = createClient()
  
  const { error } = await db
    .from("send_queue")
    .update({ 
      scheduled_for: new Date().toISOString()
    })
    .in("id", ids)
    .eq("status", "queued")
  
  if (error) {
    console.error("[v0] Error sending queue items now:", error)
    throw new Error("Failed to send messages now")
  }
  
  revalidatePath("/send-queue")
  revalidatePath("/campaigns")
}

// Get pending review items
export async function getPendingReviewItems(campaignId?: string) {
  const db = createClient()
  
  let query = db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(id, name, email, phone, organization, department, jurisdiction)
    `)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
  
  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error("[v0] Error fetching pending review items:", error)
    return []
  }
  
  return data
}
