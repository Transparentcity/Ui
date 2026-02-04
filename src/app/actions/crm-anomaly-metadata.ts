"use server"

import { revalidatePath } from "next/cache"
import { createDb } from "@/lib/db"
import type { CrmAnomalyMetadata } from "@/lib/types"

/**
 * Get or create CRM metadata for an anomaly
 * This ensures every anomaly has CRM metadata when needed
 */
export async function getOrCreateCrmMetadata(anomalyId: number): Promise<CrmAnomalyMetadata> {
  const db = createDb()
  
  // Try to get existing metadata
  const existing = await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .first()
  
  if (existing) {
    return existing as CrmAnomalyMetadata
  }
  
  // Create new metadata with defaults
  const newMetadata = await db
    .from('crm_anomaly_metadata')
    .insert({
      anomaly_id: anomalyId,
      district_label: null,
      is_citywide: false,
      severity: 'medium',
      crm_status: 'new',
      notes: null,
    })
    .returning()
    .first()
  
  revalidatePath("/anomalies")
  return newMetadata as CrmAnomalyMetadata
}

/**
 * Update CRM status for an anomaly
 */
export async function updateCrmStatus(
  anomalyId: number, 
  status: 'new' | 'sent' | 'acknowledged' | 'resolved'
): Promise<void> {
  const db = createDb()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update status
  await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .update({ crm_status: status })
  
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
  const db = createDb()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update severity
  await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .update({ severity })
  
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
  const db = createDb()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update district label and citywide flag
  await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .update({ 
      district_label: districtLabel,
      is_citywide: isCitywide
    })
  
  revalidatePath("/anomalies")
}

/**
 * Update CRM notes for an anomaly
 */
export async function updateCrmNotes(
  anomalyId: number,
  notes: string | null
): Promise<void> {
  const db = createDb()
  
  // Ensure metadata exists
  await getOrCreateCrmMetadata(anomalyId)
  
  // Update notes
  await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .update({ notes })
  
  revalidatePath("/anomalies")
}

/**
 * Bulk update CRM status for multiple anomalies
 */
export async function bulkUpdateCrmStatus(
  anomalyIds: number[],
  status: 'new' | 'sent' | 'acknowledged' | 'resolved'
): Promise<void> {
  const db = createDb()
  
  // Ensure all have metadata
  for (const anomalyId of anomalyIds) {
    await getOrCreateCrmMetadata(anomalyId)
  }
  
  // Bulk update
  await db
    .from('crm_anomaly_metadata')
    .whereIn('anomaly_id', anomalyIds)
    .update({ crm_status: status })
  
  revalidatePath("/anomalies")
  revalidatePath("/send-queue")
}

/**
 * Delete CRM metadata for an anomaly
 */
export async function deleteCrmMetadata(anomalyId: number): Promise<void> {
  const db = createDb()
  
  await db
    .from('crm_anomaly_metadata')
    .where({ anomaly_id: anomalyId })
    .delete()
  
  revalidatePath("/anomalies")
}
