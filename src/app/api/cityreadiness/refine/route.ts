import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Configure paths
const PLATFORM_DIR = path.resolve(process.cwd(), "../TranparentCityPlatform")
const DATA_DIR = path.join(PLATFORM_DIR, "data")
const EXCLUSIONS_FILE = path.join(DATA_DIR, "dataset_match_exclusions.json")
const MATCH_TIMESTAMPS_FILE = path.join(DATA_DIR, "dataset_match_timestamps.json")
const SCRIPT_PATH = path.join(PLATFORM_DIR, "scripts", "city_readiness_report.py")
const REPORTS_DIR = process.env.CITYREADINESS_REPORT_DIR || "/private/tmp"

// City IDs used in the report
const TARGET_CITY_IDS = "57035,56838,57201,57260,56692,56743,57110,56768,57259,56729,57261,56718,56735,56577,56593,56656,57414,56493,56883,56919,57323,56711,56690,57345,57378,57337,56709,56608,56620,57330"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const newExclusions = body.exclusions as Array<{ 
        city_id: number | string; 
        metric_key: string; 
        dataset_id: string;
        city_name?: string; 
    }>

    if (!Array.isArray(newExclusions) || newExclusions.length === 0) {
      return NextResponse.json({ error: "No exclusions provided" }, { status: 400 })
    }

    // 1. Ensure data dir exists
    await fs.mkdir(DATA_DIR, { recursive: true })

    // 2. Load existing exclusions
    type ExclusionEntry = {
      city_id: number | string
      metric_key: string
      dataset_id: string
      city_name?: string
    }
    let existing: ExclusionEntry[] = []
    try {
      const content = await fs.readFile(EXCLUSIONS_FILE, "utf-8")
      existing = JSON.parse(content)
    } catch (e) {
      // ignore missing file
    }

    if (!Array.isArray(existing)) existing = []

    const SMART_REFINE_SCRIPT = path.join(PLATFORM_DIR, "scripts", "smart_refine_match.py")

    const PYTHON_EXEC = path.join(PLATFORM_DIR, "venv", "bin", "python3")
    
    for (const item of newExclusions) {
      if (!item.city_name) continue; 
      
      const refineCmd = `"${PYTHON_EXEC}" scripts/smart_refine_match.py --city-id "${item.city_id}" --city-name "${item.city_name}" --metric-key "${item.metric_key}" --rejected-dataset-id "${item.dataset_id}"`
      console.log(`[Refine] Smart refining: ${refineCmd}`)
      try {
        await execAsync(refineCmd, { cwd: PLATFORM_DIR })
      } catch (e) {
        const details = e instanceof Error ? e.message : String(e)
        console.error(
          `[Refine] Smart refine failed for ${item.city_id}/${item.metric_key}:`,
          details
        )
      }
    }

    // 3. Append new exclusions (avoiding duplicates)
    let addedCount = 0
    for (const item of newExclusions) {
      const exists = existing.some(
        (e) =>
          String(e.city_id) === String(item.city_id) &&
          e.metric_key === item.metric_key &&
          e.dataset_id === item.dataset_id
      )
      if (!exists) {
        existing.push(item)
        addedCount++
      }
    }

    // 4. Save updated exclusions
    await fs.writeFile(EXCLUSIONS_FILE, JSON.stringify(existing, null, 2))

    // 4b. Update per-metric match timestamps ONLY for refined metrics.
    // This controls the "Matched:" time shown in the UI and should not be updated
    // for unrelated metrics during report regeneration.
    try {
      let tsMap: Record<string, string> = {}
      try {
        const raw = await fs.readFile(MATCH_TIMESTAMPS_FILE, "utf-8")
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          tsMap = parsed as Record<string, string>
        }
      } catch {
        // ignore missing/invalid file
      }

      const nowIso = new Date().toISOString()
      for (const item of newExclusions) {
        const cid = String(item.city_id ?? "")
        const mk = String(item.metric_key ?? "")
        if (!cid || !mk) continue
        tsMap[`${cid}:${mk}`] = nowIso
      }

      await fs.writeFile(MATCH_TIMESTAMPS_FILE, JSON.stringify(tsMap, null, 2))
    } catch (e) {
      console.error("[Refine] Failed to update match timestamps:", e)
      // non-fatal
    }

    // 5. Trigger report regeneration
    // Generate a new filename with timestamp
    // Format: YYYY-MM-DD_HHMMSS
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19) // e.g. 2026-02-08_123456
    const reportFilename = `city_readiness_report_${timestamp}.json`
    const reportPath = path.join(REPORTS_DIR, reportFilename)

    // Build command
    // We assume python3 is in the path and has dependencies installed.
    // We execute in the platform directory.
    const cmd = `"${PYTHON_EXEC}" scripts/city_readiness_report.py --city-ids "${TARGET_CITY_IDS}" --output-json "${reportPath}" --baseline-mode all_templates --exclusions-file "${EXCLUSIONS_FILE}" --match-timestamps-file "${MATCH_TIMESTAMPS_FILE}"`

    console.log(`[Refine] Running: ${cmd}`)
    
    // We'll await execution so the UI knows when it's ready.
    // This might take 10-20 seconds.
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: PLATFORM_DIR })
      console.log("[Refine] Stdout:", stdout)
      if (stderr) console.error("[Refine] Stderr:", stderr)
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e)
      console.error("[Refine] Script execution failed:", details)
      return NextResponse.json(
        {
          error: "Failed to regenerate report",
          details,
          command: cmd,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
        ok: true, 
        message: `Saved ${addedCount} exclusions and regenerated report.`,
        reportName: reportFilename
    })

  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    console.error("[Refine] Error:", details)
    return NextResponse.json(
      { error: "Internal server error", details },
      { status: 500 }
    )
  }
}
