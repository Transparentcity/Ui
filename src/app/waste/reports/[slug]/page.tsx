import { WasteWorkpaperPage } from "@/components/waste/waste-workpaper-page"

export default async function WorkpaperRoute({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <WasteWorkpaperPage slug={slug} />
}
