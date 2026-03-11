"use client"

import { use } from "react"
import { ForensicsCategoryDetailPage } from "@/components/waste/forensics-category-detail-page"

export default function ForensicsCategoryRoute({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = use(params)
  return <ForensicsCategoryDetailPage category={category} />
}
