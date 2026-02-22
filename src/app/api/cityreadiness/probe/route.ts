import { NextResponse } from "next/server"

type ProbeRequest = {
  metricKey: string
  metricLabel?: string
  dataset: {
    dataset_id?: string
    url?: string
    title?: string
  }
}

type ColumnInfo = {
  name: string
  field?: string
  type?: string
  alias?: string
}

type ProbeResponse = {
  ok: boolean
  provider: "socrata" | "arcgis" | "unknown"
  dataset: {
    dataset_id?: string
    url?: string
    title?: string
  }
  meta?: {
    title?: string
    description?: string
    columns?: ColumnInfo[]
  }
  sample?: {
    record: Record<string, unknown> | null
    fetched_from?: string
  }
  error?: string
}

function withTimeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { controller, cleanup: () => clearTimeout(id) }
}

function pickSocrataIdFromUrl(u: string): { origin: string; datasetId: string } | null {
  try {
    const url = new URL(u)
    const parts = url.pathname.split("/").filter(Boolean)
    // https://domain/d/<id>
    const dIdx = parts.indexOf("d")
    if (dIdx >= 0 && parts[dIdx + 1]) return { origin: url.origin, datasetId: parts[dIdx + 1] }
    // https://domain/resource/<id>.json
    const rIdx = parts.indexOf("resource")
    if (rIdx >= 0 && parts[rIdx + 1]) {
      return { origin: url.origin, datasetId: parts[rIdx + 1].replace(/\.json$/i, "") }
    }
    return null
  } catch {
    return null
  }
}

function pickBestDateFieldSocrata(cols: any[]): string | null {
  const candidates: { field: string; score: number }[] = []
  for (const c of cols) {
    const field = String(c?.fieldName || "")
    const name = String(c?.name || "").toLowerCase()
    const type = String(c?.dataTypeName || "").toLowerCase()
    if (!field) continue

    let s = 0
    if (type.includes("date") || type.includes("time")) s += 50
    if (name.includes("occur") || name.includes("incident")) s += 20
    if (name.includes("created")) s += 18
    if (name.includes("date") || name.includes("time")) s += 15
    if (field.toLowerCase().includes("date") || field.toLowerCase().includes("time")) s += 10
    candidates.push({ field, score: s })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.score ? candidates[0].field : null
}

async function probeSocrata(datasetUrl: string): Promise<Omit<ProbeResponse, "ok" | "provider" | "dataset">> {
  const parsed = pickSocrataIdFromUrl(datasetUrl)
  if (!parsed) return { error: "Could not parse Socrata dataset id from URL." }

  const { origin, datasetId } = parsed
  const metaUrl = `${origin}/api/views/${datasetId}.json`
  const { controller, cleanup } = withTimeout(12_000)
  try {
    const metaRes = await fetch(metaUrl, { signal: controller.signal, cache: "no-store" })
    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => "")
      return { error: `Socrata metadata failed (${metaRes.status}): ${text || metaRes.statusText}` }
    }
    const meta = (await metaRes.json()) as any
    const cols = Array.isArray(meta?.columns) ? meta.columns : []
    const dateField = pickBestDateFieldSocrata(cols)

    const dataUrl = new URL(`${origin}/resource/${datasetId}.json`)
    dataUrl.searchParams.set("$limit", "1")
    if (dateField) {
      dataUrl.searchParams.set("$order", `${dateField} DESC`)
      dataUrl.searchParams.set("$where", `${dateField} IS NOT NULL`)
    }

    const dataRes = await fetch(dataUrl.toString(), { signal: controller.signal, cache: "no-store" })
    const dataJson = dataRes.ok ? ((await dataRes.json()) as any) : null
    const record = Array.isArray(dataJson) && dataJson.length ? (dataJson[0] as Record<string, unknown>) : null

    return {
      meta: {
        title: meta?.name,
        description: meta?.description,
        columns: cols.map((c: any) => ({
          name: String(c?.name || c?.fieldName || ""),
          field: String(c?.fieldName || ""),
          type: String(c?.dataTypeName || ""),
        })),
      },
      sample: { record, fetched_from: dataUrl.toString() },
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown Socrata probe error."
    return { error: msg }
  } finally {
    cleanup()
  }
}

function pickArcgisItemInfo(datasetIdOrUrl: string): { itemId: string; layer: number } | null {
  try {
    const u = new URL(datasetIdOrUrl)
    const itemId = u.searchParams.get("id")
    const sub = u.searchParams.get("sublayer")
    if (!itemId) return null
    const layer = sub ? Number.parseInt(sub, 10) : 0
    return { itemId, layer: Number.isFinite(layer) ? layer : 0 }
  } catch {
    return null
  }
}

function pickBestDateFieldArcgis(fields: any[]): string | null {
  const candidates: { name: string; score: number }[] = []
  for (const f of fields) {
    const name = String(f?.name || "")
    const alias = String(f?.alias || "").toLowerCase()
    const type = String(f?.type || "").toLowerCase()
    if (!name) continue
    let s = 0
    if (type.includes("date")) s += 50
    if (alias.includes("occur") || alias.includes("incident")) s += 18
    if (alias.includes("created")) s += 16
    if (alias.includes("date") || alias.includes("time")) s += 12
    if (name.toLowerCase().includes("date") || name.toLowerCase().includes("time")) s += 10
    candidates.push({ name, score: s })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.score ? candidates[0].name : null
}

async function probeArcgisItem(itemUrl: string, layer: number): Promise<Omit<ProbeResponse, "ok" | "provider" | "dataset">> {
  const info = pickArcgisItemInfo(itemUrl)
  if (!info) return { error: "Could not parse ArcGIS item id." }

  const { itemId } = info
  const itemJsonUrl = `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`
  const { controller, cleanup } = withTimeout(12_000)
  try {
    const itemRes = await fetch(itemJsonUrl, { signal: controller.signal, cache: "no-store" })
    if (!itemRes.ok) {
      const text = await itemRes.text().catch(() => "")
      return { error: `ArcGIS item lookup failed (${itemRes.status}): ${text || itemRes.statusText}` }
    }
    const item = (await itemRes.json()) as any
    const serviceUrl: string | null = item?.url || null
    if (!serviceUrl) return { error: "ArcGIS item JSON did not include a service URL." }

    const layerUrl = `${serviceUrl.replace(/\/+$/,"")}/${layer}`
    const layerMetaUrl = `${layerUrl}?f=pjson`
    const layerRes = await fetch(layerMetaUrl, { signal: controller.signal, cache: "no-store" })
    if (!layerRes.ok) {
      const text = await layerRes.text().catch(() => "")
      return { error: `ArcGIS layer metadata failed (${layerRes.status}): ${text || layerRes.statusText}` }
    }
    const layerMeta = (await layerRes.json()) as any
    const fields = Array.isArray(layerMeta?.fields) ? layerMeta.fields : []
    const dateField = pickBestDateFieldArcgis(fields)

    const where = dateField ? `${dateField} IS NOT NULL` : "1=1"
    const queryUrl = new URL(`${layerUrl}/query`)
    queryUrl.searchParams.set("where", where)
    queryUrl.searchParams.set("outFields", "*")
    queryUrl.searchParams.set("resultRecordCount", "1")
    queryUrl.searchParams.set("f", "json")
    if (dateField) queryUrl.searchParams.set("orderByFields", `${dateField} DESC`)

    const qRes = await fetch(queryUrl.toString(), { signal: controller.signal, cache: "no-store" })
    const qJson = qRes.ok ? ((await qRes.json()) as any) : null
    const attrs =
      Array.isArray(qJson?.features) && qJson.features.length
        ? (qJson.features[0]?.attributes as Record<string, unknown>)
        : null

    return {
      meta: {
        title: item?.title,
        description: item?.description,
        columns: fields.map((f: any) => ({
          name: String(f?.name || ""),
          alias: String(f?.alias || ""),
          type: String(f?.type || ""),
        })),
      },
      sample: {
        record: attrs,
        fetched_from: queryUrl.toString(),
      },
    }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown ArcGIS probe error."
    return { error: msg }
  } finally {
    cleanup()
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as ProbeRequest
    const datasetId = body?.dataset?.dataset_id
    const datasetUrl = body?.dataset?.url

    if (!body?.metricKey) {
      const res: ProbeResponse = {
        ok: false,
        provider: "unknown",
        dataset: body?.dataset ?? {},
        error: "metricKey is required",
      }
      return NextResponse.json(res, { status: 400 })
    }
    if (!datasetUrl && !datasetId) {
      const res: ProbeResponse = {
        ok: false,
        provider: "unknown",
        dataset: body?.dataset ?? {},
        error: "dataset.url or dataset.dataset_id is required",
      }
      return NextResponse.json(res, { status: 400 })
    }

    // Provider detection
    const arcgisInfo = datasetId ? pickArcgisItemInfo(datasetId) : null
    if (arcgisInfo && datasetId) {
      const probed = await probeArcgisItem(datasetId, arcgisInfo.layer)
      const res: ProbeResponse = {
        ok: !probed.error,
        provider: "arcgis",
        dataset: body.dataset,
        ...probed,
      }
      return NextResponse.json(res, { status: res.ok ? 200 : 502 })
    }

    if (datasetUrl) {
      const soc = pickSocrataIdFromUrl(datasetUrl)
      if (soc) {
        const probed = await probeSocrata(datasetUrl)
        const res: ProbeResponse = {
          ok: !probed.error,
          provider: "socrata",
          dataset: body.dataset,
          ...probed,
        }
        return NextResponse.json(res, { status: res.ok ? 200 : 502 })
      }
    }

    const res: ProbeResponse = {
      ok: false,
      provider: "unknown",
      dataset: body.dataset,
      error: "Unsupported dataset URL/provider (only Socrata / ArcGIS item URLs are supported right now).",
    }
    return NextResponse.json(res, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    const res: ProbeResponse = { ok: false, provider: "unknown", dataset: {}, error: msg }
    return NextResponse.json(res, { status: 500 })
  }
}

