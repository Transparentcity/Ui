"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createDynamicTemplate(formData: FormData) {
  const db = await createClient()
  
  const name = formData.get("name") as string
  const channel = formData.get("channel") as string
  const category = formData.get("category") as string
  const subject = formData.get("subject") as string
  const body = formData.get("body") as string
  const variationEnabled = formData.get("variation_enabled") === "true"
  const toneProfileId = formData.get("tone_profile_id") as string
  const subjectVariationsJson = formData.get("subject_variations") as string
  const customVariationsJson = formData.get("custom_variations") as string
  
  // Create the template
  const { data: template, error: templateError } = await db
    .from("templates")
    .insert({
      name,
      channel,
      category: category || null,
      subject: subject || null,
      body,
      variation_enabled: variationEnabled,
      tone_profile_id: toneProfileId || null,
    })
    .select()
    .single() as { data: { id: string } | null; error: Error | null }
  
  if (templateError || !template) {
    console.error("[v0] Error creating template:", templateError)
    throw new Error("Failed to create template")
  }
  
  // Add subject variations
  if (subjectVariationsJson) {
    try {
      const subjectVariations = JSON.parse(subjectVariationsJson) as { subject: string; weight: number }[]
      if (subjectVariations.length > 0) {
        const { error: subjectError } = await db
          .from("subject_variations")
          .insert(
            subjectVariations
              .filter(v => v.subject.trim())
              .map(v => ({
                template_id: template.id,
                subject: v.subject,
                weight: v.weight,
              }))
          )

        if (subjectError) {
          console.error("[v0] Error adding subject variations:", subjectError)
        }
      }
    } catch (e) {
      console.error("[v0] Invalid subject variations JSON:", e)
    }
  }

  // Add custom slot variations
  if (customVariationsJson) {
    try {
      const customVariations = JSON.parse(customVariationsJson) as Record<string, string[]>
      const variationInserts = Object.entries(customVariations)
        .filter(([_, variations]) => variations.length > 0 && variations.some(v => v.trim()))
        .map(([key, variations]) => ({
          template_id: template.id,
          variation_key: key,
          variations: variations.filter(v => v.trim()),
        }))

      if (variationInserts.length > 0) {
        const { error: variationError } = await db
          .from("template_variations")
          .insert(variationInserts)

        if (variationError) {
          console.error("[v0] Error adding custom variations:", variationError)
        }
      }
    } catch (e) {
      console.error("[v0] Invalid custom variations JSON:", e)
    }
  }
  
  revalidatePath("/templates")
  return template
}

export async function updateDynamicTemplate(id: string, formData: FormData) {
  const db = await createClient()
  
  const name = formData.get("name") as string
  const channel = formData.get("channel") as string
  const category = formData.get("category") as string
  const subject = formData.get("subject") as string
  const body = formData.get("body") as string
  const variationEnabled = formData.get("variation_enabled") === "true"
  const toneProfileId = formData.get("tone_profile_id") as string
  const subjectVariationsJson = formData.get("subject_variations") as string
  const customVariationsJson = formData.get("custom_variations") as string
  
  // Update the template
  const { error: templateError } = await db
    .from("templates")
    .update({
      name,
      channel,
      category: category || null,
      subject: subject || null,
      body,
      variation_enabled: variationEnabled,
      tone_profile_id: toneProfileId || null,
    })
    .eq("id", id)
  
  if (templateError) {
    console.error("[v0] Error updating template:", templateError)
    throw new Error("Failed to update template")
  }
  
  // Replace subject variations
  await db.from("subject_variations").delete().eq("template_id", id)

  if (subjectVariationsJson) {
    try {
      const subjectVariations = JSON.parse(subjectVariationsJson) as { subject: string; weight: number }[]
      if (subjectVariations.length > 0) {
        await db
          .from("subject_variations")
          .insert(
            subjectVariations
              .filter(v => v.subject.trim())
              .map(v => ({
                template_id: id,
                subject: v.subject,
                weight: v.weight,
              }))
          )
      }
    } catch (e) {
      console.error("[v0] Invalid subject variations JSON:", e)
    }
  }

  // Replace custom slot variations
  await db.from("template_variations").delete().eq("template_id", id)

  if (customVariationsJson) {
    try {
      const customVariations = JSON.parse(customVariationsJson) as Record<string, string[]>
      const variationInserts = Object.entries(customVariations)
        .filter(([_, variations]) => variations.length > 0 && variations.some(v => v.trim()))
        .map(([key, variations]) => ({
          template_id: id,
          variation_key: key,
          variations: variations.filter(v => v.trim()),
        }))

      if (variationInserts.length > 0) {
        await db.from("template_variations").insert(variationInserts)
      }
    } catch (e) {
      console.error("[v0] Invalid custom variations JSON:", e)
    }
  }
  
  revalidatePath("/templates")
}

export async function getToneProfiles() {
  const db = await createClient()
  
  const { data, error } = await db
    .from("tone_profiles")
    .select("*")
    .order("name")
  
  if (error) {
    console.error("[v0] Error fetching tone profiles:", error)
    return []
  }
  
  return data
}

export async function getTemplateWithVariations(id: string) {
  const db = await createClient()
  
  const { data: template, error: templateError } = await db
    .from("templates")
    .select(`
      *,
      tone_profile:tone_profiles(*),
      variations:template_variations(*),
      subject_variations(*)
    `)
    .eq("id", id)
    .single()
  
  if (templateError) {
    console.error("[v0] Error fetching template:", templateError)
    return null
  }
  
  return template
}

export async function getTemplatesWithVariations() {
  const db = await createClient()
  
  const { data, error } = await db
    .from("templates")
    .select(`
      *,
      tone_profile:tone_profiles(*),
      variations:template_variations(*),
      subject_variations(*)
    `)
    .order("updated_at", { ascending: false })
  
  if (error) {
    console.error("[v0] Error fetching templates:", error)
    return []
  }
  
  return data
}
