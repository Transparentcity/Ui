import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"

type ReportListItem = {
  name: string
  generated_at: string | null
  mtime_ms: number
  size_bytes: number
}

function getReportsDir(): string {
  return process.env.CITYREADINESS_REPORT_DIR || "/private/tmp"
}

function isSafeName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name)
}

async function safeReadGeneratedAt(filePath: string): Promise<string | null> {
  // Try to parse just enough to get `generated_at`.
  // We read the full file because JSON parsing needs complete input, but these
  // reports are typically manageable (< a few MB).
  const raw = await fs.readFile(filePath, "utf8")
  try {
    const parsed = JSON.parse(raw) as { generated_at?: string }
    return typeof parsed?.generated_at === "string" ? parsed.generated_at : null
  } catch {
    return null
  }
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get("name")

  const dir = getReportsDir()

  if (name) {
    if (!isSafeName(name)) {
      return NextResponse.json({ error: "Invalid report name." }, { status: 400 })
    }
    const full = path.resolve(dir, name)
    const base = path.resolve(dir)
    if (!full.startsWith(base + path.sep)) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 })
    }

    try {
      const stat = await fs.stat(full)
      if (!stat.isFile()) {
        return NextResponse.json({ error: "Not a file." }, { status: 404 })
      }
      // Guard against huge files
      if (stat.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "Report is too large to load." }, { status: 413 })
      }
      const raw = await fs.readFile(full, "utf8")
      // Return as JSON object (not string)
      const parsed = JSON.parse(raw) as unknown
      return NextResponse.json(parsed, { status: 200 })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      return NextResponse.json({ error: `Failed to load report: ${msg}` }, { status: 404 })
    }
  }

  // List mode
  try {
    const entries = await fs.readdir(dir)
    const candidates = entries
      .filter((n) => n.endsWith(".json"))
      .filter((n) => n.startsWith("city_readiness_report_"))
      .filter(isSafeName)

    const items: ReportListItem[] = []
    for (const n of candidates) {
      const full = path.join(dir, n)
      try {
        const stat = await fs.stat(full)
        if (!stat.isFile()) continue
        const generated_at = await safeReadGeneratedAt(full)
        items.push({
          name: n,
          generated_at,
          mtime_ms: stat.mtimeMs,
          size_bytes: stat.size,
        })
      } catch {
        // ignore unreadable files
      }
    }
    items.sort((a, b) => {
      // Prefer generated_at when present; fallback to mtime.
      const ga = a.generated_at ? Date.parse(a.generated_at) : NaN
      const gb = b.generated_at ? Date.parse(b.generated_at) : NaN
      if (!Number.isNaN(gb) && !Number.isNaN(ga) && gb !== ga) return gb - ga
      if (!Number.isNaN(gb) && Number.isNaN(ga)) return -1
      if (Number.isNaN(gb) && !Number.isNaN(ga)) return 1
      return b.mtime_ms - a.mtime_ms
    })

    return NextResponse.json({ dir, reports: items }, { status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: `Failed to list reports: ${msg}`, dir }, { status: 500 })
  }
}

