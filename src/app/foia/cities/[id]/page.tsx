import { CityProfileContent } from "@/components/foia/city-profile-content"

export default async function CityProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CityProfileContent cityId={id} />
}
