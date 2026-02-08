import { RequestDetailContent } from "@/components/foia/request-detail-content"

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestDetailContent requestId={id} />
}
