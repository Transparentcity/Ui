import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { ComposePageContent } from "@/components/compose-page-content"

export const dynamic = 'force-dynamic'

interface ComposePageProps {
  searchParams?: Promise<{ contactId?: string }>
}

export default async function ComposePage({ searchParams }: ComposePageProps) {
  const params = searchParams ? await searchParams : {}
  const initialContactId = params?.contactId || null
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
    .order("name")

  const { data: keywordsData } = await db
    .from("keywords")
    .select("*")
    .order("name")

  const contacts = Array.isArray(contactsData) ? contactsData : []
  const keywords = Array.isArray(keywordsData) ? keywordsData : []

  return (
    <DashboardShell
      title="AI Compose"
      description="Select a contact and generate a personalized anomaly email"
    >
      <ComposePageContent
        contacts={contacts as any}
        keywords={keywords as any}
        initialContactId={initialContactId}
      />
    </DashboardShell>
  )
}
