import { createClient } from "@/lib/db"
import { ComposePageContent } from "@/components/compose-page-content"

export default async function ComposePage() {
  const db = await createClient()

  const { data: contactsData } = await db
    .from("prospects")
    .select(`
      *,
      prospect_keywords (
        keyword_id,
        keywords:keyword_id (id, name)
      )
    `)
    .eq("status", "active")
    .order("priority", { ascending: false })

  const { data: keywordsData } = await db
    .from("keywords")
    .select("*")
    .order("name")

  const contacts = Array.isArray(contactsData) ? contactsData : []
  const keywords = Array.isArray(keywordsData) ? keywordsData : []

  return (
    <ComposePageContent
      contacts={contacts as any}
      keywords={keywords as any}
    />
  )
}
