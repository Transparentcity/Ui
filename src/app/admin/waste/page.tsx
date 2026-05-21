import { redirect } from "next/navigation";

export default async function WasteIndex({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  redirect(city ? `/admin/waste/findings?city=${encodeURIComponent(city)}` : "/admin/waste/findings");
}
