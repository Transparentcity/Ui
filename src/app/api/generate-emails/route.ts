import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createClient } from "@/lib/db"

// Initialize Anthropic provider
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  try {
    const {
      sampleEmail,
      sampleSubject,
      contactIds,
      voiceNotes,
      includeAnomalies,
      /** Anomalies from Platform API (client sends pre-fetched list). */
      anomalies: anomaliesFromClient,
      /** Mode: "correspondence" (default) or "press_release" */
      mode,
    } = await req.json()

    const isPressRelease = mode === "press_release"

    if (!sampleEmail || !contactIds || contactIds.length === 0) {
      return Response.json(
        { error: "Sample email and at least one contact are required" },
        { status: 400 }
      )
    }

    const db = createClient()

    // Fetch contacts with their keywords — don't filter by status so we can
    // report which contacts were skipped rather than silently dropping them.
    const { data: contacts, error: contactsError } = await db
      .from("prospects")
      .select(`
        *,
        prospect_keywords (
          keyword_id,
          keywords:keyword_id (id, name, description, category)
        )
      `)
      .in("id", contactIds)

    if (contactsError) {
      console.error("[v0] Error fetching contacts:", contactsError)
      return Response.json({ error: "Failed to fetch contacts" }, { status: 500 })
    }

    // Cast contacts to array for type safety
    const allContacts = Array.isArray(contacts) ? contacts : []

    // Separate active vs skipped contacts
    const contactsArr = allContacts.filter((c: any) => c.status === "active")
    const skippedContacts = allContacts
      .filter((c: any) => c.status !== "active")
      .map((c: any) => c.name || c.id)

    // Also track contacts that weren't found in the DB at all
    const foundIds = allContacts.map((c: any) => c.id)
    const notFoundIds = contactIds.filter((id: string) => !foundIds.includes(id))
    if (notFoundIds.length > 0) {
      skippedContacts.push(...notFoundIds.map((id: string) => `Unknown (${id.slice(0, 8)}...)`))
    }

    if (contactsArr.length === 0) {
      return Response.json(
        { error: "No active contacts found. All selected contacts may be inactive.", skippedContacts },
        { status: 400 }
      )
    }

    // Use anomalies from client (Platform API).
    const anomalies: any[] = includeAnomalies && Array.isArray(anomaliesFromClient)
      ? anomaliesFromClient
      : []
    // Match anomalies to contacts - PRIORITY: 1) District, 2) Keywords, 3) Citywide
    // Uses district_label (TEXT) for CRM matching, not district (INTEGER)
    const contactAnomalyMap: Record<string, typeof anomalies> = {}
    
    for (const contact of contactsArr) {
      const contactJurisdiction = contact.jurisdiction?.toLowerCase()?.trim() || ""
      const contactKeywordIds = contact.prospect_keywords?.map(
        (ck: any) => ck.keyword_id
      ) || []
      
      // 1. District matches - highest priority
      // Uses district_label (TEXT) for matching, e.g., "D5", "District 11"
      const districtMatches = anomalies.filter(anomaly => {
        if (!anomaly.district_label || !contactJurisdiction) return false
        const anomalyDistrict = anomaly.district_label.toLowerCase().trim()
        // Match "D5" with "D5", "District 5", "5", etc.
        return contactJurisdiction.includes(anomalyDistrict) || 
               anomalyDistrict.includes(contactJurisdiction) ||
               contactJurisdiction.replace(/\D/g, '') === anomalyDistrict.replace(/\D/g, '')
      })
      
      // 2. Keyword matches - if contact has keywords
      const keywordMatches = anomalies.filter(anomaly => {
        if (districtMatches.includes(anomaly)) return false // Don't duplicate
        const anomalyKeywordIds = anomaly.anomaly_keywords?.map(
          (ak: any) => ak.keyword_id
        ) || []
        return anomalyKeywordIds.some((id: string) => contactKeywordIds.includes(id))
      })
      
      // 3. Citywide anomalies - always included
      // Check is_citywide flag OR district === 0 OR district_label is "Citywide"
      const citywideMatches = anomalies.filter(anomaly => {
        if (districtMatches.includes(anomaly) || keywordMatches.includes(anomaly)) return false
        return anomaly.is_citywide === true || 
               anomaly.district === 0 || 
               anomaly.district_label?.toLowerCase() === 'citywide'
      })
      
      // Combine: district first, then keywords, then citywide - max 4 total
      const combined = [...districtMatches, ...keywordMatches, ...citywideMatches]
      contactAnomalyMap[contact.id] = combined.slice(0, 4)
    }

    // Helper to sanitize strings for JSON - removes invalid Unicode surrogates
    const sanitizeForJSON = (str: string | null | undefined): string => {
      if (!str) return ''
      return str
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '') // Unpaired high surrogates
        .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // Unpaired low surrogates
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
        .replace(/[^\x00-\x7F]/g, (char) => {
          const code = char.charCodeAt(0)
          if (code >= 0x00C0 && code <= 0x024F) return char // Extended Latin
          if (code >= 0x2000 && code <= 0x206F) return ' ' // General punctuation -> space
          return '' // Remove emoji, symbols, etc.
        })
        .trim()
    }

    // Extract first name from full name
    const getFirstName = (fullName: string): string => {
      if (!fullName) return "there"
      return sanitizeForJSON(fullName).split(" ")[0] || "there"
    }

    // Format anomaly data with specific numbers for Claude
    const formatAnomalyForPrompt = (anomaly: any, isDistrictMatch: boolean, isCitywide: boolean): string => {
      const districtLabel = sanitizeForJSON(anomaly.district_label)
      const groupValue = sanitizeForJSON(anomaly.group_value)
      
      // Build location description
      const location = isCitywide 
        ? "citywide" 
        : isDistrictMatch && districtLabel 
          ? `in ${districtLabel}` 
          : groupValue 
            ? `in ${groupValue}`
            : "local"
      
      // Calculate the change direction and magnitude
      const pctChange = anomaly.pct_change || 0
      const direction = pctChange > 0 ? "increased" : pctChange < 0 ? "decreased" : "unchanged"
      const magnitude = Math.abs(pctChange).toFixed(1)
      
      // Get metric name - sanitize to remove emoji and invalid chars
      const metricName = sanitizeForJSON(anomaly.metric_name) || 'Unknown Metric'
      const groupContext = groupValue ? ` (${groupValue})` : ''
      const category = sanitizeForJSON(anomaly.metric_category) || 'general'
      
      return `
  - ANOMALY: "${metricName}${groupContext}"
    - Location: ${location}
    - Severity: ${anomaly.severity || 'medium'}
    - Change: ${direction} by ${magnitude}%
    - Recent Value: ${anomaly.recent_mean?.toFixed(1) || 'N/A'}
    - Previous Average: ${anomaly.comparison_mean?.toFixed(1) || 'N/A'}
    - Category: ${category}
    - ID: ${anomaly.id}`
    }

    // Build the prompt for Claude
    const contactDescriptions = contactsArr.map((contact: any) => {
      const contactName = sanitizeForJSON(contact.name) || 'Unknown'
      const firstName = getFirstName(contactName)
      const keywords = contact.prospect_keywords?.map(
        (ck: any) => sanitizeForJSON(ck.keywords?.name)
      ).filter(Boolean).join(", ") || "none"
      
      const matchedAnomalies = contactAnomalyMap[contact.id] || []
      
      // Separate district vs citywide anomalies for clarity
      const districtAnomalies = matchedAnomalies.filter((a: any) => 
        a.district_label && contact.jurisdiction?.toLowerCase().includes(a.district_label.toLowerCase().replace(/\D/g, ''))
      )
      const citywideAnomalies = matchedAnomalies.filter((a: any) => a.is_citywide)
      const otherAnomalies = matchedAnomalies.filter((a: any) => 
        !districtAnomalies.includes(a) && !citywideAnomalies.includes(a)
      )

      const anomalyDescriptions = [
        ...districtAnomalies.map((a: any) => formatAnomalyForPrompt(a, true, false)),
        ...otherAnomalies.map((a: any) => formatAnomalyForPrompt(a, false, false)),
        ...citywideAnomalies.map((a: any) => formatAnomalyForPrompt(a, false, true)),
      ].join("\n")

      return `
=== CONTACT ===
Full Name: ${contactName}
FIRST NAME TO USE IN EMAIL: ${firstName}
Title: ${sanitizeForJSON(contact.title) || "N/A"}
Organization: ${sanitizeForJSON(contact.organization) || "N/A"}
Department: ${sanitizeForJSON(contact.department) || "N/A"}
Jurisdiction/District: ${sanitizeForJSON(contact.jurisdiction) || "N/A"}
Interest Keywords: ${keywords}
Contact ID: ${contact.id}

${matchedAnomalies.length > 0 ? `ANOMALIES TO INCLUDE (use real data from these):
${anomalyDescriptions}

Anomaly IDs to return: ${matchedAnomalies.map((a: any) => a.id).join(", ")}` : "No matching anomalies for this contact"}
`
    }).join("\n---\n")

    const pressReleasePrompt = `You are an expert PR writer for Transparent City, a civic tech organization. Your task is to generate press releases for media contacts based on a sample draft.

PRESS RELEASE FORMAT:
1. SUBJECT LINE: Write a compelling, newsworthy headline. Examples:
   - "New Data Reveals 47% Spike in SF Permit Delays"
   - "Transparent City Analysis: Housing Complaints Triple in Key Districts"

2. BODY STRUCTURE:
   - Opening paragraph: Lead with the most newsworthy finding, include key numbers
   - Context paragraph: Background on what Transparent City does and why this matters
   - Data details: Specific anomaly findings with real numbers, district-level details
   - Quote from Transparent City (use the sample for tone)
   - Closing: Where to learn more, contact info for follow-up
   - Boilerplate: Brief "About Transparent City" section

3. PERSONALIZATION:
   - Tailor the angle to the reporter's beat and coverage area
   - Lead with anomalies relevant to their primary city or beat
   - Use the reporter's first name in a brief personal note at the top
   - e.g., "Hi Sarah, thought this would be relevant to your city hall coverage:"

4. Each press release should emphasize different angles based on the reporter's beat
5. NEVER leave placeholders - always use real data values

${voiceNotes ? `VOICE/STYLE NOTES FROM USER:\n${voiceNotes}\n` : ""}`

    const correspondencePrompt = `You are an expert at writing professional government correspondence for Transparent City, a civic tech organization that shares data anomalies with government officials. Your task is to generate unique, personalized email variations based on a sample email.

CRITICAL PERSONALIZATION RULES:
1. SUBJECT LINE: Create a catchy, personal subject that hints at the most relevant anomaly finding. Examples:
   - "Connie - 47% spike in permit delays in D1"
   - "Quick data note: Housing complaints up 3x in your district"
   - "Matt - Something interesting about SFPD response times"
   Use the contact's FIRST NAME only (extract from their full name).

2. FIRST NAME: ALWAYS use the contact's actual first name (extract from their full name). Never use placeholders like [FIRST NAME] or {{name}}.

3. ANOMALY INTEGRATION: When including anomalies, write them as compelling, readable sentences with the ACTUAL DATA:
   - Include the specific numeric finding (percentage change, count, trend)
   - Write naturally, not as a template: "In District 5 last month, building permits took 47% longer to process than the citywide average - 156 days vs 106 days."
   - For citywide anomalies: "Across the city, 311 response times have jumped 23% since January."

4. Each email MUST be meaningfully different - vary sentence structure, word choice, paragraph order, and phrasing
5. Maintain the same professional tone and core message as the sample
6. NEVER send identical emails to people in the same organization
7. The variations should feel like they were written individually, not templated
8. NEVER leave placeholders like [ANOMALY 1], [FIRST NAME], {{name}}, etc. - ALWAYS replace with real values.

${voiceNotes ? `VOICE/STYLE NOTES FROM USER:\n${voiceNotes}\n` : ""}

For each contact, generate a completely unique email that:
- Has a catchy subject line featuring the most relevant anomaly finding with a specific number
- Uses the contact's FIRST NAME (not full name) in greeting
- Opens differently (vary greetings, opening hooks)
- Integrates anomalies as natural, readable sentences with REAL NUMBERS from the data
- Uses different transition phrases
- Has a unique call-to-action phrasing
- Closes differently (vary sign-offs)`

    const systemPrompt = isPressRelease ? pressReleasePrompt : correspondencePrompt

    // Sanitize the sample email content
    const cleanSubject = sanitizeForJSON(sampleSubject) || "Data Update from Transparent City"
    const cleanEmail = sanitizeForJSON(sampleEmail)
    
    const userPrompt = `Here is the sample email to base variations on:

SAMPLE SUBJECT: ${cleanSubject}

SAMPLE EMAIL:
${cleanEmail}

---

IMPORTANT INSTRUCTIONS:
1. For SUBJECT: Create a catchy, personal subject featuring the contact's FIRST NAME and a specific number from their most relevant anomaly. Examples:
   - "Connie - 47% permit delay spike in D1"
   - "Quick note: 3x more housing complaints in your district"
   - "Matt, wanted to flag this SFPD data"

2. For BODY:
   - Start with "Hi [FIRST NAME]," using their actual first name (e.g., "Hi Connie,")
   - NEVER use placeholders like [FIRST NAME], [ANOMALY 1], {{name}}, etc.
   - Write anomalies as natural sentences with REAL NUMBERS, e.g.:
     "In your district last month, building permits took 47% longer to process than average—156 days vs 106 days citywide."
   - Include one district-specific anomaly (if available) AND one citywide anomaly
   - End with your sign-off matching the sample's tone

3. For each contact below, use the EXACT data provided - the titles, descriptions, and numbers are REAL data to include.

${contactDescriptions}

Generate ${contactsArr.length} unique emails, one per contact. Return valid JSON:
{
  "emails": [
    {
      "subject": "Catchy subject with first name and a number",
      "body": "Full email body with real names and real anomaly data",
      "contactId": "the contact's ID",
      "anomalyIds": ["list", "of", "anomaly", "ids", "used"]
    }
  ]
}`

    // Call Claude via AI SDK
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 8000,
    } as any)

    // Parse JSON from the response
    let generatedEmails: any[] = []
    try {
      const text = result.text
      const jsonMatch = text.match(/\{[\s\S]*"emails"[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        generatedEmails = parsed.emails || []
      }
    } catch (parseError) {
      console.error("[v0] Error parsing AI response:", parseError)
      throw new Error("Failed to parse AI-generated emails")
    }

    return Response.json({
      success: true,
      emails: generatedEmails,
      contactCount: contactsArr.length,
      anomalyCount: anomalies.length,
      skippedContacts,
    })
  } catch (error) {
    console.error("[v0] Error generating emails:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate emails" },
      { status: 500 }
    )
  }
}
