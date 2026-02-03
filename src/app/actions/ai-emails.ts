"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

interface GeneratedEmail {
  subject: string
  body: string
  contactId: string
  anomalyIds: string[]
}

export async function queueGeneratedEmails(emails: GeneratedEmail[]) {
  const db = createClient()

  // Add all emails to the send queue with pending_review status
  const queueItems = emails.map(email => ({
    prospect_id: email.contactId,  // Fixed: was contact_id
    channel: "email" as const,
    personalized_subject: email.subject,
    personalized_body: email.body,
    anomaly_snippet: email.anomalyIds.length > 0 
      ? `Anomaly IDs: ${email.anomalyIds.join(", ")}`
      : null,
    status: "pending_review" as const,  // Start in review status
    priority: 5, // Default priority
    variation_seed: Math.floor(Math.random() * 1000000),
    scheduled_for: null,  // Will be set when approved
  }))

  const { data, error } = await db
    .from("send_queue")
    .insert(queueItems)
    .select()

  if (error) {
    console.error("[v0] Error queueing emails:", error)
    throw new Error("Failed to queue emails")
  }

  // Anomaly crm_status is not updated (Platform API has no crm_status; no Supabase).

  revalidatePath("/send-queue")
  revalidatePath("/anomalies")
  revalidatePath("/")

  return { success: true, count: Array.isArray(data) ? data.length : 0 }
}

// Save a draft AI-generated campaign
export async function saveAIDraft(
  name: string,
  sampleEmail: string,
  sampleSubject: string,
  voiceNotes: string,
  emails: GeneratedEmail[]
) {
  const db = createClient()

  // Create a campaign record
  const { data: campaign, error: campaignError } = await db
    .from("campaigns")
    .insert({
      name,
      description: `AI-generated campaign with ${emails.length} unique emails`,
      status: "draft",
    })
    .select()
    .single() as { data: { id: string } | null; error: Error | null }

  if (campaignError || !campaign) {
    console.error("[v0] Error creating campaign:", campaignError)
    throw new Error("Failed to save draft")
  }

  // Store the emails as messages in draft status
  const messages = emails.map(email => ({
    prospect_id: email.contactId,  // Fixed: was contact_id
    campaign_id: campaign.id,
    channel: "email" as const,
    subject: email.subject,
    body: email.body,
    status: "pending" as const,
  }))

  const { error: messagesError } = await db
    .from("messages")
    .insert(messages)

  if (messagesError) {
    console.error("[v0] Error saving messages:", messagesError)
  }

  revalidatePath("/campaigns")
  
  return { success: true, campaignId: campaign.id }
}
