import { ForensicsCategoryDetailPage } from "@/components/waste/forensics-category-detail-page"

export default async function CategoryDetailRoute({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  return <ForensicsCategoryDetailPage category={category} />
}
