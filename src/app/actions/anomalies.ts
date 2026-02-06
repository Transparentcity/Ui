"use server"

import { revalidatePath } from "next/cache"

const READ_ONLY_MESSAGE =
  "Anomaly management is read-only. Anomalies come from the TransparentCity Platform (detection runs). Create/update/delete are not available."

export async function createAnomaly(_formData: FormData) {
  revalidatePath("/anomalies")
  revalidatePath("/")
  throw new Error(READ_ONLY_MESSAGE)
}

export async function updateAnomaly(_id: string, _formData: FormData) {
  revalidatePath("/anomalies")
  revalidatePath("/")
  throw new Error(READ_ONLY_MESSAGE)
}

export async function updateAnomalyStatus(_id: string, _status: string) {
  revalidatePath("/anomalies")
  revalidatePath("/")
  throw new Error(READ_ONLY_MESSAGE)
}

export async function deleteAnomaly(_id: string) {
  revalidatePath("/anomalies")
  revalidatePath("/")
  throw new Error(READ_ONLY_MESSAGE)
}

export async function bulkCreateAnomalies(_anomalies: Array<{
  title: string
  district: string | null
  severity: "low" | "medium" | "high" | "critical"
  is_citywide: boolean
}>) {
  revalidatePath("/anomalies")
  revalidatePath("/")
  throw new Error(READ_ONLY_MESSAGE)
}
