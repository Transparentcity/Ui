import { CityReadinessShell } from "@/components/cityreadiness-shell"
import { SchemaMatchContent } from "@/components/cityreadiness/schema-match-content"

export const metadata = {
  title: "Schema Match | City Readiness",
  description: "Inspect columns + sample records for matched datasets",
}

export default function CityReadinessSchemaPage() {
  return (
    <CityReadinessShell
      title="Schema match"
      description="Pull column names and a recent sample record from public APIs, then compare to the expected schema for each metric."
    >
      <SchemaMatchContent />
    </CityReadinessShell>
  )
}

