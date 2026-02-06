"use server"

import { createClient } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createKeyword(formData: FormData) {
  const db = await createClient()
  
  const name = formData.get('name') as string
  const category = formData.get('category') as string | null
  const description = formData.get('description') as string | null

  const { error } = await db
    .from('keywords')
    .insert({
      name,
      category: category || null,
      description: description || null
    })

  if (error) {
    console.error('Error creating keyword:', error)
    throw new Error('Failed to create keyword')
  }

  revalidatePath('/keywords')
  revalidatePath('/contacts')
}

export async function deleteKeyword(id: string) {
  const db = await createClient()
  
  const { error } = await db
    .from('keywords')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting keyword:', error)
    throw new Error('Failed to delete keyword')
  }

  revalidatePath('/keywords')
  revalidatePath('/contacts')
}
