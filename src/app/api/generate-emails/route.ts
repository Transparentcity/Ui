import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createClient } from "@/lib/db"
import { getArchetypeById } from "@/lib/press-release-archetypes"

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
      /** Optional archetype ID for press release mode (e.g. "T1-26") */
      archetypeId,
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

    // Build archetype context if one is selected
    const selectedArchetype = archetypeId ? getArchetypeById(archetypeId) : null
    if (archetypeId && !selectedArchetype) {
      return Response.json(
        { error: `Invalid archetype ID: ${archetypeId}` },
        { status: 400 }
      )
    }
    const archetypeContext = selectedArchetype
      ? `\nSTORY ARCHETYPE SELECTED: ${selectedArchetype.name} (${selectedArchetype.id})
${selectedArchetype.description}
Dataset: ${selectedArchetype.dataset}
${selectedArchetype.exampleHeadline ? `Example headline for tone: ${selectedArchetype.exampleHeadline}` : ""}

Use this archetype as the angle for the press release. Match anomaly data to this story type where possible. If no anomaly data matches the archetype, generate the release from the archetype description and dataset reference. The user may paste supporting data into the sample email field.\n`
      : ""

    const pressReleasePrompt = `You are writing press releases for Transparent City, a civic data analysis platform. Each press release covers a SINGLE finding from city data. One topic, one story, one angle.

CRITICAL STYLE RULES:

1. SINGLE TOPIC. One finding per release. Not a data roundup. Not "here are 5 interesting things." Pick the most newsworthy finding and write about that.

2. WRITE LIKE A REPORTER discovered this in public data, not like a tech company announcing a feature. The story is the civic finding. Transparent City is the source/analyst, not the subject.
   BAD: "Transparent City's anomaly detection engine identified a persistent pattern..."
   GOOD: "San Francisco's 311 data contains a pattern so consistent it might be the most predictable thing about city government..."

3. NEVER describe the platform's internal features, templates, or methodology as the story. No "our context story engine generates monthly reports." The story is the DATA FINDING.

4. LEAD WITH THE MOST SURPRISING NUMBER.
   BAD: "Business registration trends show improvement in 2025."
   GOOD: "San Francisco gained 1,869 net new businesses in 2025. The year before, the number was 42."

5. USE SPECIFIC COMPARISONS, not vague language.
   BAD: "significantly longer response times"
   GOOD: "2.8 times longer -- 67 hours vs. 24 hours citywide"

6. MAKE IT ENTERTAINING where the data supports it. Lean into human absurdity: a custodian working 82 hrs/week, the Monday complaint spike, the mural capital being the graffiti capital. Don't sanitize everything into dry policy language.

7. END STRONG. Last paragraph should be quotable or memorable.
   GOOD: "The data can't tell you whether this is art or vandalism. But it can tell you where the question is being asked 35,000 times a year."

8. PERSONALIZE THE COVER NOTE. 2-3 sentences to the reporter referencing their beat, coverage area, or recent work. Explain why this specific finding matters to their audience. Suggest a follow-up angle.

STRUCTURE:
- Subject line: Newsworthy headline with a specific number
- Personal note (2-3 sentences, use first name, reference their beat)
- Lead paragraph: The core finding with the key number
- 3-4 body paragraphs: context, comparison, implication, kicker
- Brief methodology note (dataset name, what was measured)
- "About Transparent City" one-liner: Transparent City is a civic data platform that analyzes public records across 30 US cities to surface patterns, anomalies, and stories in government data. More at transparentcity.us.

ANOMALY INTEGRATION:
When anomalies are provided, build the release around the most newsworthy one. Use ACTUAL numbers (pct_change, recent_mean, comparison_mean). Each reporter gets a DIFFERENT angle, not a rephrased version of the same release.

EXAMPLE HEADLINES (for tone reference):
- "San Francisco Gained 1,869 Net New Businesses in 2025. The Year Before, the Number Was 42."
- "New Construction Permits Jumped 159%. Demolitions Tripled. What's Going On?"
- "138,317 Graffiti Reports. One Neighborhood Accounts for a Quarter. It's the Same One Famous for Its Murals."
- "Bayview Residents Wait Nearly 3x Longer for Street Cleaning Than the Rest of San Francisco"
- "One Custodian Averaged 82 Hours a Week, All Year. That's 11.7 Hours a Day With No Days Off."
- "A Fake Illinois Company Billed San Francisco $627,000 Over 4.5 Years."

AVOID THESE PATTERNS:
- "Transparent City Analysis Reveals Interesting Patterns" (no number, self-referential)
- "New Data Shows Various Anomalies Across Multiple Departments" (vague data dump)
- "Our AI Detected 13 Entities" (self-referential, not single topic)

NEVER leave placeholders. Always use real data values.
${archetypeContext}${voiceNotes ? `ADDITIONAL VOICE/STYLE NOTES:\n${sanitizeForJSON(voiceNotes)}\n` : ""}`

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

${voiceNotes ? `VOICE/STYLE NOTES FROM USER:\n${sanitizeForJSON(voiceNotes)}\n` : ""}

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
