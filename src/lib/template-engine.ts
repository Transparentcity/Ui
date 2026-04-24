import type { Contact, TemplateWithVariations, Anomaly, ToneProfile } from './types'

// Default variation phrases organized by slot and tone
const DEFAULT_VARIATIONS: Record<string, Record<string, string[]>> = {
  greeting: {
    formal: [
      'Dear {{title}} {{name}}',
      'Dear {{name}}',
      'Respected {{title}} {{name}}',
      '{{title}} {{name}}',
    ],
    professional: [
      'Dear {{name}}',
      'Hello {{name}}',
      '{{name}}',
      'Good day, {{name}}',
    ],
    friendly: [
      'Hi {{name}}',
      'Hello {{name}}',
      'Hey {{name}}',
      'Good to reach you, {{name}}',
    ],
    urgent: [
      'Attention: {{title}} {{name}}',
      '{{title}} {{name}} — Urgent',
      'Dear {{name}}',
      'Important: {{name}}',
    ],
  },
  opening: {
    formal: [
      'I am writing to bring to your attention',
      'I wish to inform you of',
      'This correspondence concerns',
      'I am reaching out regarding',
      'Please allow me to share',
    ],
    professional: [
      'I wanted to share with you',
      'I\'m reaching out about',
      'I\'m writing to inform you of',
      'I wanted to bring to your attention',
      'I hope this message finds you well. I\'m contacting you about',
    ],
    friendly: [
      'I wanted to quickly share',
      'I came across something that might interest you',
      'I thought you should know about',
      'I hope you\'re doing well! I wanted to share',
      'Quick heads up about',
    ],
    urgent: [
      'This requires your immediate attention:',
      'I need to urgently inform you about',
      'Time-sensitive information regarding',
      'Please review this critical finding:',
      'Immediate attention needed:',
    ],
  },
  anomaly_intro: {
    formal: [
      'Our analysis has identified the following data anomaly',
      'We have detected an irregularity that warrants your review',
      'Our data systems have flagged the following concern',
      'A significant data discrepancy has been identified',
    ],
    professional: [
      'We\'ve found something that may need attention',
      'Our data analysis uncovered an interesting finding',
      'We\'ve identified a data point worth reviewing',
      'Here\'s what our analysis revealed',
    ],
    friendly: [
      'We spotted something you might want to look into',
      'Here\'s an interesting finding from our data',
      'We noticed something that caught our attention',
      'Check out what we discovered',
    ],
    urgent: [
      'Critical anomaly detected',
      'Immediate review required for this finding',
      'High-priority data irregularity identified',
      'Urgent: Our systems flagged this issue',
    ],
  },
  call_to_action: {
    formal: [
      'We kindly request your review and response at your earliest convenience',
      'Your consideration of this matter would be greatly appreciated',
      'We would welcome the opportunity to discuss this further',
      'Please do not hesitate to contact us should you require additional information',
    ],
    professional: [
      'Please let us know if you\'d like more details',
      'We\'d appreciate your thoughts on this',
      'Feel free to reach out if you have questions',
      'We\'re happy to provide additional context if needed',
    ],
    friendly: [
      'Let me know what you think!',
      'Would love to hear your thoughts',
      'Drop me a line if you want to chat about this',
      'Happy to discuss further anytime',
    ],
    urgent: [
      'Please respond as soon as possible',
      'We need your input on this promptly',
      'Your immediate feedback is requested',
      'Please prioritize reviewing this matter',
    ],
  },
  closing: {
    formal: [
      'Thank you for your time and consideration',
      'We appreciate your attention to this matter',
      'With respect and appreciation',
      'Thank you for your service to {{jurisdiction}}',
    ],
    professional: [
      'Thanks for your time',
      'Looking forward to hearing from you',
      'Thank you for considering this',
      'Appreciate your attention to this',
    ],
    friendly: [
      'Thanks so much!',
      'Really appreciate it',
      'Thanks for taking the time',
      'Cheers and thanks',
    ],
    urgent: [
      'Thank you for your prompt attention',
      'We appreciate your swift response',
      'Thank you for prioritizing this',
      'Your immediate attention is valued',
    ],
  },
  signature: {
    formal: [
      'Respectfully,',
      'With regards,',
      'Sincerely,',
      'Yours faithfully,',
    ],
    professional: [
      'Best regards,',
      'Best,',
      'Regards,',
      'Kind regards,',
    ],
    friendly: [
      'Best,',
      'Cheers,',
      'Thanks,',
      'All the best,',
    ],
    urgent: [
      'Urgently,',
      'With urgency,',
      'Regards,',
      'Best,',
    ],
  },
}

// Synonym replacements for natural variation
const WORD_VARIATIONS: Record<string, string[]> = {
  'important': ['significant', 'notable', 'crucial', 'key', 'vital'],
  'data': ['information', 'findings', 'analysis', 'insights', 'metrics'],
  'issue': ['matter', 'concern', 'situation', 'topic', 'subject'],
  'review': ['examine', 'consider', 'assess', 'evaluate', 'look into'],
  'contact': ['reach out to', 'get in touch with', 'connect with', 'communicate with'],
  'immediately': ['promptly', 'as soon as possible', 'without delay', 'at your earliest convenience'],
  'regarding': ['concerning', 'about', 'with respect to', 'relating to'],
  'found': ['discovered', 'identified', 'detected', 'uncovered', 'observed'],
  'anomaly': ['irregularity', 'discrepancy', 'variance', 'deviation', 'inconsistency'],
}

// Seeded random number generator for reproducible variations
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

// Select a random item from array using seeded random
function selectRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]
}

// Generate a unique seed based on contact and campaign
export function generateVariationSeed(contactId: string, campaignId?: string): number {
  const str = `${contactId}-${campaignId || 'single'}-${Date.now()}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

// Replace template variables with contact data
export function personalizeContent(
  content: string, 
  contact: Contact, 
  anomaly?: Anomaly | null
): string {
  let result = content
  
  // Contact variables
  result = result.replace(/\{\{name\}\}/g, contact.name || '')
  result = result.replace(/\{\{title\}\}/g, contact.title || '')
  result = result.replace(/\{\{organization\}\}/g, contact.organization || '')
  result = result.replace(/\{\{department\}\}/g, contact.department || '')
  result = result.replace(/\{\{jurisdiction\}\}/g, contact.jurisdiction || '')
  result = result.replace(/\{\{email\}\}/g, contact.email || '')
  result = result.replace(/\{\{city\}\}/g, contact.city_name || '')
  
  // Anomaly variables
  if (anomaly) {
    result = result.replace(/\{\{anomaly_title\}\}/g, anomaly.title || '')
    result = result.replace(/\{\{anomaly_description\}\}/g, anomaly.description || '')
    result = result.replace(/\{\{anomaly_severity\}\}/g, anomaly.severity || '')
    result = result.replace(/\{\{anomaly_source\}\}/g, anomaly.data_source || '')
  }
  
  // Clean up any remaining empty variables
  result = result.replace(/\{\{[^}]+\}\}/g, '')
  
  return result.trim()
}

// Apply word-level variations to text
function applyWordVariations(text: string, random: () => number): string {
  let result = text
  
  for (const [word, alternatives] of Object.entries(WORD_VARIATIONS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    result = result.replace(regex, () => {
      // 40% chance to replace with synonym
      if (random() < 0.4) {
        return selectRandom(alternatives, random)
      }
      return word
    })
  }
  
  return result
}

// Get tone name from profile or default
function getToneName(toneProfile?: ToneProfile | null): string {
  if (!toneProfile) return 'professional'
  return toneProfile.name.toLowerCase()
}

// Generate variation for a specific slot
export function generateSlotVariation(
  slot: string,
  toneProfile: ToneProfile | null,
  customVariations: string[] | null,
  random: () => number
): string {
  const toneName = getToneName(toneProfile)
  
  // Use custom variations if provided
  if (customVariations && customVariations.length > 0) {
    return selectRandom(customVariations, random)
  }
  
  // Fall back to default variations
  const slotVariations = DEFAULT_VARIATIONS[slot]
  if (!slotVariations) return ''
  
  const toneVariations = slotVariations[toneName] || slotVariations['professional']
  return selectRandom(toneVariations, random)
}

// Process template with variation markers
// Markers format: [[slot:greeting]] or [[slot:opening|custom1|custom2|custom3]]
export function processVariationMarkers(
  content: string,
  toneProfile: ToneProfile | null,
  random: () => number
): string {
  return content.replace(/\[\[slot:(\w+)(?:\|([^\]]+))?\]\]/g, (_, slot, customOptions) => {
    const customVariations = customOptions ? customOptions.split('|').map((s: string) => s.trim()) : null
    return generateSlotVariation(slot, toneProfile, customVariations, random)
  })
}

// Generate a unique anomaly snippet for same-office recipients
export function generateAnomalySnippet(
  anomaly: Anomaly,
  contact: Contact,
  random: () => number
): string {
  const introOptions = [
    `In ${contact.jurisdiction || 'your area'}, we noticed`,
    `Our analysis of ${contact.department || 'your department'}'s data revealed`,
    `Specifically for ${contact.organization || 'your organization'}, we found`,
    `Looking at data relevant to your work, we identified`,
    `Based on information pertaining to ${contact.jurisdiction || 'your jurisdiction'},`,
  ]
  
  const intro = selectRandom(introOptions, random)
  
  const severityPhrases: Record<string, string[]> = {
    critical: ['a critical issue requiring immediate attention', 'an urgent matter', 'a high-priority concern'],
    high: ['a significant finding', 'an important matter', 'a notable concern'],
    medium: ['an interesting pattern', 'something worth noting', 'a relevant finding'],
    low: ['a minor observation', 'something to be aware of', 'a small but notable item'],
  }
  
  const severity = anomaly.severity || 'medium'
  const severityPhrase = selectRandom(severityPhrases[severity] || severityPhrases['medium'], random)
  
  return `${intro} ${severityPhrase}: ${anomaly.title}${anomaly.description ? ` — ${anomaly.description}` : ''}`
}

// Main function to generate a fully varied email
export interface GeneratedEmail {
  subject: string
  body: string
  variationData: {
    seed: number
    slotsUsed: string[]
    wordReplacements: number
    anomalySnippet?: string
  }
}

export function generateVariedEmail(
  template: TemplateWithVariations,
  contact: Contact,
  anomaly: Anomaly | null,
  seed?: number
): GeneratedEmail {
  const variationSeed = seed ?? generateVariationSeed(contact.id)
  const random = seededRandom(variationSeed)
  
  const toneProfile = template.tone_profile || null
  const slotsUsed: string[] = []
  
  // Select subject variation
  let subject = template.subject || ''
  if (template.subject_variations && template.subject_variations.length > 0) {
    // Weight-based selection
    const totalWeight = template.subject_variations.reduce((sum, v) => sum + v.weight, 0)
    let pick = random() * totalWeight
    for (const variation of template.subject_variations) {
      pick -= variation.weight
      if (pick <= 0) {
        subject = variation.subject
        break
      }
    }
  }
  
  // Process body with variation markers
  let body = template.body
  
  // Find and track slots used
  const slotMatches = body.match(/\[\[slot:(\w+)/g)
  if (slotMatches) {
    slotMatches.forEach(match => {
      const slot = match.replace('[[slot:', '')
      if (!slotsUsed.includes(slot)) {
        slotsUsed.push(slot)
      }
    })
  }
  
  // Process variation markers
  body = processVariationMarkers(body, toneProfile, random)
  
  // Apply word-level variations if enabled
  let wordReplacements = 0
  if (template.variation_enabled !== false) {
    const originalBody = body
    body = applyWordVariations(body, random)
    // Count replacements (rough estimate)
    wordReplacements = (originalBody.match(/\b(important|data|issue|review|contact|immediately|regarding|found|anomaly)\b/gi) || []).length
  }
  
  // Generate unique anomaly snippet for same-office differentiation
  let anomalySnippet: string | undefined
  if (anomaly) {
    anomalySnippet = generateAnomalySnippet(anomaly, contact, random)
    body = body.replace(/\{\{anomaly_snippet\}\}/g, anomalySnippet)
  }
  
  // Personalize with contact data
  subject = personalizeContent(subject, contact, anomaly)
  body = personalizeContent(body, contact, anomaly)
  
  return {
    subject,
    body,
    variationData: {
      seed: variationSeed,
      slotsUsed,
      wordReplacements,
      anomalySnippet,
    },
  }
}

// Generate preview variations to show user what emails might look like
export function generatePreviews(
  template: TemplateWithVariations,
  contact: Contact,
  anomaly: Anomaly | null,
  count: number = 3
): GeneratedEmail[] {
  const previews: GeneratedEmail[] = []
  
  for (let i = 0; i < count; i++) {
    const seed = generateVariationSeed(contact.id) + i * 1000
    previews.push(generateVariedEmail(template, contact, anomaly, seed))
  }
  
  return previews
}

// Check if two contacts are in the same office
export function areInSameOffice(contact1: Contact, contact2: Contact): boolean {
  // Check by office_group first if available
  if ('office_group' in contact1 && 'office_group' in contact2) {
    const group1 = (contact1 as Contact & { office_group?: string }).office_group
    const group2 = (contact2 as Contact & { office_group?: string }).office_group
    if (group1 && group2 && group1 === group2) return true
  }
  
  // Fall back to organization + department matching
  if (contact1.organization && contact2.organization) {
    if (contact1.organization === contact2.organization) {
      // Same org, check department
      if (contact1.department && contact2.department) {
        return contact1.department === contact2.department
      }
      return true // Same org, assume same office
    }
  }
  
  return false
}
