"use client"

import { use } from "react"
import { InvestigationDetailPage } from "@/components/waste/investigation-detail-page"

export default function WasteInvestigationRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <InvestigationDetailPage investigationId={id} />
}
