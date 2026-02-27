#!/usr/bin/env node

/**
 * Seed media prospects from TransparentSF Media List CSV.
 * Inserts into prospects table with contact_type='media'.
 * Usage: node scripts/seed-media-from-csv.js [path-to-csv]
 * Default: ~/Downloads/TransparentSF Media List - Reporters.csv
 */

const { Client } = require("pg")
const fs = require("fs")
const path = require("path")

const envPaths = [
  path.join(__dirname, "..", ".env.local"),
  path.join(__dirname, "..", ".env"),
]
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8")
    envContent.split("\n").forEach((line) => {
      const [key, ...valueParts] = line.split("=")
      if (key && valueParts.length > 0) {
        const value = valueParts.join("=").trim()
        if (!process.env[key.trim()]) process.env[key.trim()] = value
      }
    })
  }
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found")
  process.exit(1)
}

const csvPath =
  process.argv[2] ||
  path.join(
    process.env.HOME || "",
    "Downloads",
    "TransparentSF Media List - Reporters.csv"
  )

function parseCSVLine(line) {
  const result = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (inQuotes) current += c
    else if (c === ",") {
      result.push(current.trim())
      current = ""
    } else current += c
  }
  result.push(current.trim())
  return result
}

function clean(val) {
  if (!val || typeof val !== "string") return null
  const v = val.trim()
  if (!v || v === "(n/a)" || v.toLowerCase() === "n/a") return null
  return v
}

function isURL(s) {
  return /^https?:\/\//i.test(s?.trim() || "")
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: false })
  await client.connect()

  if (!fs.existsSync(csvPath)) {
    console.error("❌ CSV not found:", csvPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(csvPath, "utf-8")
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const header = parseCSVLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const vals = parseCSVLine(line)
    const obj = {}
    header.forEach((h, j) => {
      obj[h.trim()] = vals[j] ?? ""
    })
    return obj
  })

  console.log(`📄 Loaded ${rows.length} rows from CSV\n`)

  const keywordCache = new Map()
  const getOrCreateKeyword = async (name) => {
    const n = name.trim()
    if (!n || n.length < 2) return null
    const key = n.toLowerCase()
    if (keywordCache.has(key)) return keywordCache.get(key)
    const { rows: kw } = await client.query(
      "SELECT id FROM keywords WHERE LOWER(name) = LOWER($1)",
      [n]
    )
    if (kw.length > 0) {
      keywordCache.set(key, kw[0].id)
      return kw[0].id
    }
    const { rows: ins } = await client.query(
      `INSERT INTO keywords (name, category) VALUES ($1, 'Media')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [n]
    )
    if (ins.length > 0) {
      keywordCache.set(key, ins[0].id)
      return ins[0].id
    }
    return null
  }

  let inserted = 0
  let skipped = 0

  for (const row of rows) {
    const name = clean(row["Name"])
    if (!name) {
      skipped++
      continue
    }

    const email = clean(row["Email"])
    const outlet = clean(row["Outlet/Platform"])
    const title = clean(row["Title"])
    const primaryBeat = clean(row["Primary Beat/Topic"])
    const phoneRaw = clean(row["Phone"])
    const phone =
      phoneRaw && !/^\(n\/a\)$/i.test(phoneRaw) ? phoneRaw : null

    const keywordsStr = row["Keywords"] || ""
    const keywordNames = keywordsStr
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)

    const articleLinkRaw = (row[" Article Link"] ?? row["Article Link"] ?? "").trim()
    const articleUrl = isURL(articleLinkRaw) ? articleLinkRaw : null

    const { rows: existing } = await client.query(
      "SELECT id FROM prospects WHERE LOWER(name) = LOWER($1) AND contact_type = 'media'",
      [name]
    )
    if (existing.length > 0) {
      console.log(`  ⏭ Skip (exists): ${name}`)
      skipped++
      continue
    }

    const { rows: ins } = await client.query(
      `INSERT INTO prospects (
        name, outlet_platform, title, email, phone, primary_beat,
        primary_city, coverage_cities, sub_geographies, contact_type, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'media', 3, 'active')
      RETURNING id`,
      [
        name,
        outlet || null,
        title || null,
        email || null,
        phone,
        primaryBeat || null,
        "San Francisco",
        [],
        [],
      ]
    )

    const prospectId = ins[0].id

    for (const kwName of keywordNames) {
      const kwId = await getOrCreateKeyword(kwName)
      if (kwId) {
        await client.query(
          `INSERT INTO prospect_keywords (prospect_id, keyword_id)
           VALUES ($1, $2) ON CONFLICT (prospect_id, keyword_id) DO NOTHING`,
          [prospectId, kwId]
        )
      }
    }

    if (articleUrl) {
      await client.query(
        `INSERT INTO prospect_article_links (prospect_id, url) VALUES ($1, $2)`,
        [prospectId, articleUrl]
      )
    }

    inserted++
    console.log(`  ✓ ${name} (${outlet || "-"})`)
  }

  console.log(`\n✅ Imported ${inserted} media prospects, skipped ${skipped}`)
  await client.end()
}

main().catch((err) => {
  console.error("❌ Error:", err.message)
  process.exit(1)
})
