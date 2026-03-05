import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { ContactsTable } from "@/components/contacts-table"
import { ContactDialog } from "@/components/contact-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export const dynamic = "force-dynamic"

interface ContactsPageProps {
  searchParams?: Promise<{ type?: string }>
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const db = createClient()
  const params = searchParams ? await searchParams : {}
  const typeParam = params?.type
  const initialTypeFilter =
    typeParam === "media"
      ? ("media" as const)
      : typeParam === "city_staff"
        ? ("city_staff" as const)
        : undefined

  const { data: contactsData } = await db
    .from("prospects")
    .select(
      `
      *,
      prospect_keywords(keyword:keywords(id, name))
    `
    )
    .order("created_at", { ascending: false })

  const { data: articleLinksData } = await db.from("prospect_article_links").select("*")

  const { data: keywordsData } = await db.from("keywords").select("*").order("name")

  // Fetch send_queue counts grouped by prospect_id and status
  const { data: draftCountsData } = await db
    .from("send_queue")
    .select("prospect_id, status")

  const contacts = Array.isArray(contactsData) ? contactsData : []
  const articleLinks = Array.isArray(articleLinksData) ? articleLinksData : []
  const keywords = Array.isArray(keywordsData) ? keywordsData : []
  const draftRows = Array.isArray(draftCountsData) ? draftCountsData : []

  // Build draft counts map: prospect_id -> { pending, sent }
  const draftCountsMap = new Map<string, { pending: number; sent: number }>()
  for (const row of draftRows) {
    const pid = (row as { prospect_id: string }).prospect_id
    const status = (row as { status: string }).status
    const entry = draftCountsMap.get(pid) ?? { pending: 0, sent: 0 }
    if (status === "pending_review") entry.pending++
    else if (status === "sent") entry.sent++
    draftCountsMap.set(pid, entry)
  }

  const linksByProspect = new Map<string, (typeof articleLinks)[number][]>()
  for (const a of articleLinks) {
    const pid = (a as { prospect_id: string }).prospect_id
    const arr = linksByProspect.get(pid) ?? []
    arr.push(a)
    linksByProspect.set(pid, arr)
  }

  const contactsWithKeywords = contacts.map((contact: Record<string, unknown>) => ({
    ...contact,
    contact_type: contact.contact_type || "city_staff",
    keywords:
      (contact.prospect_keywords as { keyword: { id: string; name: string } }[])?.map(
        (ck) => ck.keyword
      ) ?? [],
    article_links: linksByProspect.get(contact.id as string) ?? [],
    draftCounts: draftCountsMap.get(contact.id as string) ?? undefined,
  }))

  return (
    <DashboardShell
      title="Contacts"
      description="City staff and media prospects"
      actions={
        <ContactDialog keywords={keywords as any}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </ContactDialog>
      }
    >
      <ContactsTable
          contacts={contactsWithKeywords as any}
          keywords={keywords as any}
          initialTypeFilter={initialTypeFilter}
        />
    </DashboardShell>
  )
}
