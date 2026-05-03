import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { TemplatesManager } from "@/components/templates-manager"
import { TemplateDialog } from "@/components/template-dialog"
import { QuickShareDialog } from "@/components/quick-share-dialog"
import { Button } from "@/components/ui/button"
import { Plus, Send } from "lucide-react"

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
      description="Pick a template, attach a story, copy. Or use AI Compose for personalized batches."
      actions={
        <div className="flex items-center gap-2">
          <QuickShareDialog templates={templates as any}>
            <Button variant="default" className="gap-1.5">
              <Send className="w-4 h-4" />
              Quick Share
            </Button>
          </QuickShareDialog>
          <TemplateDialog>
            <Button variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </TemplateDialog>
        </div>
      }
    >
      <TemplatesManager templates={templates as any} />
    </DashboardShell>
  )
}
