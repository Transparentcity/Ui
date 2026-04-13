"use client"

import type { PublicCitySitemapItem } from "@/lib/publicApiClient"
import { Loader2 } from "lucide-react"

interface WasteCityPickerProps {
  selectedCityId: number
  cities: PublicCitySitemapItem[]
  isLoading?: boolean
  isFetching?: boolean
  onChange: (cityId: number | null) => void
}

export function WasteCityPicker({
  selectedCityId,
  cities,
  isLoading,
  isFetching,
  onChange,
}: WasteCityPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="waste-city-select-global" className="text-xs text-gray-500">
        City
      </label>
      {isFetching ? <Loader2 className="w-3 h-3 text-gray-500 animate-spin" /> : null}
      <select
        id="waste-city-select-global"
        className="h-8 min-w-[220px] rounded border border-gray-300 bg-white px-2 text-xs"
        value={selectedCityId}
        onChange={(e) => {
          const next = Number(e.target.value)
          onChange(Number.isFinite(next) && next > 0 ? next : null)
        }}
        disabled={isLoading || cities.length === 0}
        title="Select a city to analyze"
      >
        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.emoji ? `${city.emoji} ` : ""}{city.name}
          </option>
        ))}
      </select>
    </div>
  )
}
