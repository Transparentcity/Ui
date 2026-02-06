import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { ResponsesManager } from "@/components/responses-manager"
import { ResponseDialog } from "@/components/response-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export const dynamic = 'force-dynamic'
export default async function ResponsesPage() {
  const db = await createClient()
  
  const [responsesResult, contactsResult] = await Promise.all([
    db
      .from('responses')
      .select(`
        *,
        contact:prospects(id, name, organization, email),
        message:messages(id, subject, channel)
      `)
      .order('responded_at', { ascending: false }),
    db.from('prospects').select('id, name, organization').eq('status', 'active').order('name')
  ])

  const responses = Array.isArray(responsesResult.data) ? responsesResult.data : []
  const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []

  return (
    <DashboardShell
      title="Responses"
      description="Track and manage responses from government officials"
      actions={
        <ResponseDialog contacts={contacts as any}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Log Response
          </Button>
        </ResponseDialog>
      }
    >
      <ResponsesManager 
        responses={responses as any} 
        contacts={contacts as any}
      />
    </DashboardShell>
  )
}
