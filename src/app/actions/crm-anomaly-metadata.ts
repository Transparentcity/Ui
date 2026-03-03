"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/db"
import type { CrmAnomalyMetadata } from "@/lib/types"

/**
 * Get or create CRM metadata for an anomaly
 * This ensures every anomaly has CRM metadata when needed
 */
export async function getOrCreateCrmMetadata(anomalyId: number): Promise<CrmAnomalyMetadata> {
  const db = await createClient()
  
  // Try to get existing metadata
  const { data: existing, error: selectError } = await db
    .from('crm_anomaly_metadata')
    .select('*')
    .eq('anomaly_id', anomalyId)
    .single()
  
  if (existing && !selectError) {
    return existing as CrmAnomalyMetadata
  }
  
  // Create new metadata with defaults
  const { data: newMetadata, error: insertError } = await db
    .from('crm_anomaly_metadata')
    .insert({
      anomaly_id: anomalyId,
      district_label: null,
      is_citywide: false,
      severity: 'medium',
      crm_status: 'new',
      notes: null,
    })
    .select()
    .single()
  
  if (insertError || !newMetadata) {
    throw new Error(`Failed to create CRM metadata: ${insertError?.message}`)
  }
  
  revalidatePath("/anomalies")
  return newMetadata as CrmAnomalyMetadata
}

/**
 * Fetch CRM metadata for a list of anomaly IDs.
 * Returns a map keyed by anomaly_id for lightweight client merging.
 */
export async function getCrmMetadataForAnomalies(
  anomalyIds: number[]
): Promise<Record<number, CrmAnomalyMetadata>> {
  const uniqueIds = Array.from(new Set(anomalyIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (uniqueIds.length === 0) return {}

  const db = await createClient()
  const { data, error } = await db
    .from('crm_anomaly_metadata')
    .select('*')
    .in('anomaly_id', uniqueIds)

  if (error) {
    throw new Error(`Failed to fetch CRM metadata: ${error.message}`)
  }

  const rows = (data ?? []) as CrmAnomalyMetadata[]
  return rows.reduce<Record<number, CrmAnomalyMetadata>>((acc, row) => {
    acc[row.anomaly_id] = row
    return acc
  }, {})
}

/**
 * Update CRM status for an anomaly
 */
export async function updateCrmStatus(
  anomalyId: number, 
  status: 'new' | 'sent' | 'acknowledged' | 'resolved'
): Promise<void> {
  const db = await createClient()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update status
  const { error } = await db
    .from('crm_anomaly_metadata')
    .update({ crm_status: status })
    .eq('anomaly_id', anomalyId)
  
  if (error) {
    throw new Error(`Failed to update CRM status: ${error.message}`)
  }
  
  revalidatePath("/anomalies")
  revalidatePath("/send-queue")
}

/**
 * Update CRM severity for an anomaly
 */
export async function updateCrmSeverity(
  anomalyId: number,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  const db = await createClient()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update severity
  const { error } = await db
    .from('crm_anomaly_metadata')
    .update({ severity })
    .eq('anomaly_id', anomalyId)
  
  if (error) {
    throw new Error(`Failed to update CRM severity: ${error.message}`)
  }
  
  revalidatePath("/anomalies")
}

/**
 * Update district label for an anomaly
 */
export async function updateCrmDistrictLabel(
  anomalyId: number,
  districtLabel: string | null,
  isCitywide: boolean = false
): Promise<void> {
  const db = await createClient()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update district label and citywide flag
  const { error } = await db
    .from('crm_anomaly_metadata')
    .update({ 
      district_label: districtLabel,
      is_citywide: isCitywide
    })
    .eq('anomaly_id', anomalyId)
  
  if (error) {
    throw new Error(`Failed to update CRM district label: ${error.message}`)
  }
  
  revalidatePath("/anomalies")
}

/**
 * Update CRM notes for an anomaly
 */
export async function updateCrmNotes(
  anomalyId: number,
  notes: string | null
): Promise<void> {
  const db = await createClient()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update notes
  const { error } = await db
    .from('crm_anomaly_metadata')
    .update({ notes })
    .eq('anomaly_id', anomalyId)
  
  if (error) {
    throw new Error(`Failed to update CRM notes: ${error.message}`)
  }
  
  revalidatePath("/anomalies")
}

/**
 * Bulk update CRM status for multiple anomalies
 */
export async function bulkUpdateCrmStatus(
  anomalyIds: number[],
  status: 'new' | 'sent' | 'acknowledged' | 'resolved'
): Promise<void> {
  const db = await createClient()
  
  // Ensure all have metadata
  for (const anomalyId of anomalyIds) {
    await getOrCreateCrmMetadata(anomalyId)
  }
  
  // Bulk update using individual updates (Supabase doesn't support whereIn directly)
  for (const anomalyId of anomalyIds) {
    const { error } = await db
      .from('crm_anomaly_metadata')
      .update({ crm_status: status })
      .eq('anomaly_id', anomalyId)
    
    if (error) {
      console.error(`Failed to update anomaly ${anomalyId}:`, error)
    }
  }
  
  revalidatePath("/anomalies")
  revalidatePath("/send-queue")
}

/**
 * Delete CRM metadata for an anomaly
 */
export async function deleteCrmMetadata(anomalyId: number): Promise<void> {
  const db = await createClient()
  
  const { error } = await db
    .from('crm_anomaly_metadata')
    .delete()
    .eq('anomaly_id', anomalyId)
  
  if (error) {
    throw new Error(`Failed to delete CRM metadata: ${error.message}`)
  }
  
  revalidatePath("/anomalies")
}
