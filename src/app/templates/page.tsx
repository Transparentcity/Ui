import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { TemplatesManager } from "@/components/templates-manager"
import { TemplateDialog } from "@/components/template-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export const dynamic = 'force-dynamic'
export default async function TemplatesPage() {
  const db = await createClient()
  
  const { data: templatesData } = await db
    .from('templates')
    .select('*')
    .order('updated_at', { ascending: false })

  const templates = Array.isArray(templatesData) ? templatesData : []

  return (
    <DashboardShell
      title="Templates"
      description="Reusable message templates. For AI-generated personalized emails, use AI Compose."
      actions={
        <TemplateDialog>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </TemplateDialog>
      }
    >
      <TemplatesManager templates={templates as any} />
    </DashboardShell>
  )
}
