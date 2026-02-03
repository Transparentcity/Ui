"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createTemplate(formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const channel = formData.get('channel') as 'email' | 'sms'
  const category = formData.get('category') as string | null
  const subject = formData.get('subject') as string | null
  const body = formData.get('body') as string

  const { error } = await db
    .from('templates')
    .insert({
      name,
      channel,
      category: category || null,
      subject: channel === 'email' ? subject : null,
      body
    })

  if (error) {
    console.error('Error creating template:', error)
    throw new Error('Failed to create template')
  }

  revalidatePath('/templates')
  revalidatePath('/followups')
}

export async function updateTemplate(id: string, formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const channel = formData.get('channel') as 'email' | 'sms'
  const category = formData.get('category') as string | null
  const subject = formData.get('subject') as string | null
  const body = formData.get('body') as string

  const { error } = await db
    .from('templates')
    .update({
      name,
      channel,
      category: category || null,
      subject: channel === 'email' ? subject : null,
      body
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating template:', error)
    throw new Error('Failed to update template')
  }

  revalidatePath('/templates')
  revalidatePath('/followups')
}

export async function deleteTemplate(id: string) {
  const db = await createClient()
  
  const { error } = await db
    .from('templates')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting template:', error)
    throw new Error('Failed to delete template')
  }

  revalidatePath('/templates')
  revalidatePath('/followups')
}

export async function duplicateTemplate(id: string) {
  const db = await createClient()
  
  const { data: template, error: fetchError } = await db
    .from('templates')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !template) {
    console.error('Error fetching template:', fetchError)
    throw new Error('Failed to fetch template')
  }

  const { error } = await db
    .from('templates')
    .insert({
      name: `${template.name} (Copy)`,
      channel: template.channel,
      category: template.category,
      subject: template.subject,
      body: template.body
    })

  if (error) {
    console.error('Error duplicating template:', error)
    throw new Error('Failed to duplicate template')
  }

  revalidatePath('/templates')
  revalidatePath('/followups')
}

export async function createTemplateFromContent(formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const channel = formData.get('channel') as 'email' | 'sms'
  const category = formData.get('category') as string | null
  const subject = formData.get('subject') as string | null
  const body = formData.get('body') as string

  const { error } = await db
    .from('templates')
    .insert({
      name,
      channel,
      category: category || 'Follow-up',
      subject: channel === 'email' ? subject : null,
      body
    })

  if (error) {
    console.error('Error creating template from content:', error)
    throw new Error('Failed to save as template')
  }

  revalidatePath('/templates')
  revalidatePath('/followups')
}

export async function getTemplates() {
  const db = await createClient()
  
  const { data, error } = await db
    .from('templates')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching templates:', error)
    return []
  }

  return data
}
