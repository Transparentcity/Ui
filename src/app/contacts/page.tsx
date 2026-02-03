import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { ContactsTable } from "@/components/contacts-table"
import { ContactDialog } from "@/components/contact-dialog"
import { ContactImportDialog } from "@/components/contact-import-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Upload } from "lucide-react"

export default async function ContactsPage() {
  const db = await createClient()
  
  const { data: contactsData } = await db
    .from('prospects')
    .select(`
      *,
      prospect_keywords(
        keyword:keywords(id, name)
      )
    `)
    .order('created_at', { ascending: false })

  const { data: keywordsData } = await db
    .from('keywords')
    .select('*')
    .order('name')

  const contacts = Array.isArray(contactsData) ? contactsData : []
  const keywords = Array.isArray(keywordsData) ? keywordsData : []

  const contactsWithKeywords = contacts.map((contact: any) => ({
    ...contact,
    keywords: contact.prospect_keywords?.map((ck: { keyword: { id: string; name: string } }) => ck.keyword) || []
  }))

  return (
    <DashboardShell
      title="Contacts"
      description="Manage government officials and their contact information"
      actions={
        <div className="flex items-center gap-2">
          <ContactImportDialog keywords={keywords as any}>
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
          </ContactImportDialog>
          <ContactDialog keywords={keywords as any}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </ContactDialog>
        </div>
      }
    >
      <ContactsTable contacts={contactsWithKeywords as any} keywords={keywords as any} />
    </DashboardShell>
  )
}
