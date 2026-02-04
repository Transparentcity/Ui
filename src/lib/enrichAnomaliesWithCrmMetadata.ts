/**
 * Enriches anomalies from the Platform API with persisted CRM metadata
 * from the crm_anomaly_metadata table.
 */

import { createDb } from "./db"
import type { Anomaly, CrmAnomalyMetadata } from "./types"

/**
 * Enrich anomalies with CRM metadata from the database
 * Fetches CRM metadata for all anomaly IDs and merges it into the anomaly objects
 */
export async function enrichAnomaliesWithCrmMetadata(
  anomalies: Anomaly[]
): Promise<Anomaly[]> {
  if (anomalies.length === 0) return anomalies

  const db = createDb()
  const anomalyIds = anomalies.map(a => Number(a.id)).filter(id => !isNaN(id))

  if (anomalyIds.length === 0) return anomalies

  try {
    // Fetch all CRM metadata for these anomalies
    const crmMetadata = await db
      .from('crm_anomaly_metadata')
      .whereIn('anomaly_id', anomalyIds)
      .select()

    // Create a map for quick lookup
    const metadataMap = new Map<number, CrmAnomalyMetadata>()
    for (const metadata of crmMetadata as CrmAnomalyMetadata[]) {
      metadataMap.set(metadata.anomaly_id, metadata)
    }

    // Enrich anomalies with metadata
    return anomalies.map(anomaly => {
      const anomalyId = Number(anomaly.id)
      const metadata = metadataMap.get(anomalyId)

      if (!metadata) {
        // No CRM metadata yet - use defaults from mapper or existing values
        return anomaly
      }

      // Merge CRM metadata and update convenience accessors
      return {
        ...anomaly,
        crm_metadata: metadata,
        // Update convenience accessors to use persisted CRM data
        district_label: metadata.district_label,
        is_citywide: metadata.is_citywide,
        severity: metadata.severity,
        crm_status: metadata.crm_status,
      }
    })
  } catch (error) {
    console.error('[enrichAnomaliesWithCrmMetadata] Error fetching CRM metadata:', error)
    // Return anomalies unchanged if there's an error
    return anomalies
  }
}

/**
 * Enrich a single anomaly with CRM metadata
 */
export async function enrichAnomalyWithCrmMetadata(
  anomaly: Anomaly
): Promise<Anomaly> {
  const enriched = await enrichAnomaliesWithCrmMetadata([anomaly])
  return enriched[0] || anomaly
}
