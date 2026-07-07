"use client"

import type { WasteCityOption } from "@/lib/hooks/useWasteSelectedCity"
import { ChevronDown, Loader2 } from "lucide-react"

interface WasteCityPickerProps {
  selectedCityId: number
  cities: WasteCityOption[]
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
  const selectedName =
    cities.find((c) => Number(c.id) === selectedCityId)?.name ?? "City"

  return (
    <div className="relative inline-flex items-center gap-1.5 min-w-0">
      {/* Visible heading: the city name is the picker trigger, with a chevron
          beside it. The native <select> below carries the actual behavior. */}
      <span
        className="inline-flex items-center gap-1.5 text-gray-900 truncate"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: "20px",
          letterSpacing: "-0.02em",
        }}
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </span>
      {isFetching ? (
        <Loader2 className="w-3 h-3 text-gray-400 animate-spin shrink-0" />
      ) : null}
      <select
        id="waste-city-select-global"
        aria-label="Select a city to analyze"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
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
            {city.emoji ? `${city.emoji} ` : ""}
            {city.name}
          </option>
        ))}
      </select>
    </div>
  )
}
