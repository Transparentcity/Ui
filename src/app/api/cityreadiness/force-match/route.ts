import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Configure paths
const PLATFORM_DIR = path.resolve(process.cwd(), "../TranparentCityPlatform")
const DATA_DIR = path.join(PLATFORM_DIR, "data")
const OVERRIDES_FILE = path.join(DATA_DIR, "dataset_match_overrides.json")
const MATCH_TIMESTAMPS_FILE = path.join(DATA_DIR, "dataset_match_timestamps.json")
const REPORTS_DIR = process.env.CITYREADINESS_REPORT_DIR || "/private/tmp"
const TARGET_CITY_IDS = "57035,56838,57201,57260,56692,56743,57110,56768,57259,56729,57261,56718,56735,56577,56593,56656,57414,56493,56883,56919,57323,56711,56690,57345,57378,57337,56709,56608,56620,57330,57223"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { cityId, metricKey, datasetId } = body

    if (!cityId || !metricKey || !datasetId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // 1. Ensure data dir exists
    await fs.mkdir(DATA_DIR, { recursive: true })

    // 2. Load existing overrides
    type OverrideEntry = {
      city_id: number | string
      metric_key: string
      dataset_id: string
      created_at?: string
    }
    let existing: OverrideEntry[] = []
    try {
      const content = await fs.readFile(OVERRIDES_FILE, "utf-8")
      existing = JSON.parse(content)
    } catch {
      // ignore missing file
    }

    if (!Array.isArray(existing)) existing = []

    // 3. Add/Update override
    // Remove any existing override for this metric/city combo first (last wins)
    existing = existing.filter(e => !(String(e.city_id) === String(cityId) && e.metric_key === metricKey))
    
    existing.push({
        city_id: cityId,
        metric_key: metricKey,
        dataset_id: datasetId,
        created_at: new Date().toISOString()
    })

    // 4. Save updated overrides
    await fs.writeFile(OVERRIDES_FILE, JSON.stringify(existing, null, 2))

    // 4b. Update per-metric match timestamp for this manual assignment.
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
      tsMap[`${String(cityId)}:${String(metricKey)}`] = new Date().toISOString()
      await fs.writeFile(MATCH_TIMESTAMPS_FILE, JSON.stringify(tsMap, null, 2))
    } catch (e) {
      console.error("[ForceMatch] Failed to update match timestamps:", e)
      // non-fatal
    }

    // 5. Trigger report regeneration
    const PYTHON_EXEC = path.join(PLATFORM_DIR, "venv", "bin", "python3")
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19)
    const reportFilename = `city_readiness_report_${timestamp}.json`
    const reportPath = path.join(REPORTS_DIR, reportFilename)

    // Note: We pass --overrides-file to the script
    const cmd = `"${PYTHON_EXEC}" scripts/city_readiness_report.py --city-ids "${TARGET_CITY_IDS}" --output-json "${reportPath}" --baseline-mode all_templates --exclusions-file "${path.join(DATA_DIR, "dataset_match_exclusions.json")}" --overrides-file "${OVERRIDES_FILE}" --match-timestamps-file "${MATCH_TIMESTAMPS_FILE}"`

    
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: PLATFORM_DIR })
      if (stderr) console.error("[ForceMatch] Stderr:", stderr)
    } catch (e) {
      const details = e instanceof Error ? e.message : String(e)
      console.error("[ForceMatch] Script execution failed:", details)
      return NextResponse.json(
        {
          error: "Failed to regenerate report",
          details,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
        ok: true, 
        message: `Saved override and regenerated report.`,
        reportName: reportFilename
    })

  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    console.error("[ForceMatch] Error:", details)
    return NextResponse.json(
      { error: "Internal server error", details },
      { status: 500 }
    )
  }
}
