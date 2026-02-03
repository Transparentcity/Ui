import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { FollowupsManager } from "@/components/followups-manager"
import { FollowupDialog } from "@/components/followup-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default async function FollowupsPage() {
  const db = await createClient()
  
  const [followupsResult, contactsResult, templatesResult] = await Promise.all([
    db
      .from('followups')
      .select(`
        *,
        contact:prospects(id, name, organization, email),
        response:responses(id, content, sentiment)
      `)
      .order('due_date', { ascending: true }),
    db.from('prospects').select('id, name, organization').eq('status', 'active').order('name'),
    db.from('templates').select('*').order('category').order('name')
  ])

  const templates = Array.isArray(templatesResult.data) ? templatesResult.data : []
  const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []
  const followups = Array.isArray(followupsResult.data) ? followupsResult.data : []

  return (
    <DashboardShell
      title="Follow-ups"
      description="Track and manage follow-up tasks with government officials"
      actions={
        <FollowupDialog contacts={contacts as any} templates={templates as any}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Follow-up
          </Button>
        </FollowupDialog>
      }
    >
      <FollowupsManager 
        followups={followups as any} 
        contacts={contacts as any}
        templates={templates as any}
      />
    </DashboardShell>
  )
}
