import type { SendQueueItem, ThrottleSettings, Contact, TemplateWithVariations, Anomaly } from './types'
import { generateVariedEmail, generateVariationSeed, areInSameOffice } from './template-engine'

export interface QueueStats {
  total: number
  queued: number
  processing: number
  sent: number
  failed: number
  cancelled: number
}

// Default throttle settings
export const DEFAULT_THROTTLE_SETTINGS: Omit<ThrottleSettings, 'id' | 'campaign_id' | 'created_at' | 'updated_at'> = {
  emails_per_minute: 10,
  emails_per_hour: 100,
  emails_per_day: 500,
  min_delay_seconds: 5,
  max_delay_seconds: 30,
  randomize_delay: true,
  active_hours_start: 8,
  active_hours_end: 18,
  active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  respect_timezone: true,
}

// Throttle presets for quick selection
export const THROTTLE_PRESETS = {
  conservative: {
    name: 'Conservative',
    description: 'Slow and steady, best for cold outreach',
    emails_per_minute: 5,
    emails_per_hour: 50,
    emails_per_day: 200,
    min_delay_seconds: 10,
    max_delay_seconds: 60,
  },
  moderate: {
    name: 'Moderate',
    description: 'Balanced pace for general outreach',
    emails_per_minute: 10,
    emails_per_hour: 100,
    emails_per_day: 500,
    min_delay_seconds: 5,
    max_delay_seconds: 30,
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Faster delivery for time-sensitive campaigns',
    emails_per_minute: 20,
    emails_per_hour: 300,
    emails_per_day: 1000,
    min_delay_seconds: 2,
    max_delay_seconds: 15,
  },
  burst: {
    name: 'Burst',
    description: 'Maximum speed, use with caution',
    emails_per_minute: 30,
    emails_per_hour: 500,
    emails_per_day: 2000,
    min_delay_seconds: 1,
    max_delay_seconds: 5,
  },
}

// Calculate delay between sends based on throttle settings
export function calculateDelay(settings: Partial<ThrottleSettings>): number {
  const min = settings.min_delay_seconds || DEFAULT_THROTTLE_SETTINGS.min_delay_seconds
  const max = settings.max_delay_seconds || DEFAULT_THROTTLE_SETTINGS.max_delay_seconds
  
  if (settings.randomize_delay !== false) {
    return min + Math.random() * (max - min)
  }
  
  return min
}

// Check if current time is within active hours
export function isWithinActiveHours(settings: Partial<ThrottleSettings>, timezone?: string): boolean {
  const now = new Date()
  
  // If respecting timezone and one is provided, convert
  if (settings.respect_timezone && timezone) {
    try {
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
      now.setTime(localTime.getTime())
    } catch {
      // Invalid timezone, use local time
    }
  }
  
  const currentHour = now.getHours()
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  
  const startHour = settings.active_hours_start ?? DEFAULT_THROTTLE_SETTINGS.active_hours_start
  const endHour = settings.active_hours_end ?? DEFAULT_THROTTLE_SETTINGS.active_hours_end
  const activeDays = settings.active_days ?? DEFAULT_THROTTLE_SETTINGS.active_days
  
  const isActiveDay = activeDays.includes(currentDay)
  const isActiveHour = currentHour >= startHour && currentHour < endHour
  
  return isActiveDay && isActiveHour
}

// Calculate next available send time
export function getNextAvailableSendTime(settings: Partial<ThrottleSettings>, timezone?: string): Date {
  const now = new Date()
  const startHour = settings.active_hours_start ?? DEFAULT_THROTTLE_SETTINGS.active_hours_start
  const activeDays = settings.active_days ?? DEFAULT_THROTTLE_SETTINGS.active_days
  
  const target = new Date(now)
  
  // If not within active hours, find next active window
  for (let i = 0; i < 8; i++) { // Check up to 8 days ahead
    const dayName = target.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    const hour = target.getHours()
    
    if (activeDays.includes(dayName)) {
      if (hour < startHour) {
        // Same day, just wait for start hour
        target.setHours(startHour, 0, 0, 0)
        return target
      } else if (isWithinActiveHours(settings, timezone)) {
        // Currently in active window
        return target
      }
    }
    
    // Move to next day at start hour
    target.setDate(target.getDate() + 1)
    target.setHours(startHour, 0, 0, 0)
  }
  
  return target
}

// Prepare queue items with varied content, ensuring same-office recipients get different messages
export interface QueuePrepareOptions {
  campaignId: string
  template: TemplateWithVariations
  contacts: Contact[]
  anomaly?: Anomaly | null
  settings?: Partial<ThrottleSettings>
}

export function prepareQueueItems(options: QueuePrepareOptions): Omit<SendQueueItem, 'id' | 'created_at'>[] {
  const { campaignId, template, contacts, anomaly, settings } = options
  const items: Omit<SendQueueItem, 'id' | 'created_at'>[] = []
  
  // Group contacts by office to ensure variation within offices
  const officeGroups = new Map<string, Contact[]>()
  
  contacts.forEach(contact => {
    // Create office key
    const officeKey = `${contact.organization || 'unknown'}-${contact.department || 'general'}`
    const group = officeGroups.get(officeKey) || []
    group.push(contact)
    officeGroups.set(officeKey, group)
  })
  
  // Track used seeds within each office to ensure uniqueness
  const usedSeedsPerOffice = new Map<string, Set<number>>()
  
  let scheduledTime = getNextAvailableSendTime(settings || {})
  
  contacts.forEach((contact, index) => {
    const officeKey = `${contact.organization || 'unknown'}-${contact.department || 'general'}`
    const usedSeeds = usedSeedsPerOffice.get(officeKey) || new Set()
    
    // Generate unique seed for this contact, ensuring it differs from others in same office
    let seed = generateVariationSeed(contact.id, campaignId)
    let attempts = 0
    while (usedSeeds.has(seed) && attempts < 100) {
      seed = seed + 1000 + attempts
      attempts++
    }
    usedSeeds.add(seed)
    usedSeedsPerOffice.set(officeKey, usedSeeds)
    
    // Generate varied email
    const generated = generateVariedEmail(template, contact, anomaly || null, seed)
    
    // Calculate scheduled time with delay
    if (index > 0) {
      const delay = calculateDelay(settings || {})
      scheduledTime = new Date(scheduledTime.getTime() + delay * 1000)
      
      // Check if still within active hours, adjust if not
      if (!isWithinActiveHours(settings || {})) {
        scheduledTime = getNextAvailableSendTime(settings || {})
      }
    }
    
    items.push({
      campaign_id: campaignId,
      prospect_id: contact.id,
      template_id: template.id,
      channel: template.channel,
      personalized_subject: generated.subject,
      personalized_body: generated.body,
      anomaly_snippet: generated.variationData.anomalySnippet || null,
      variation_seed: seed,
      priority: contact.priority ?? 3,  // Default to medium priority if not set
      status: 'pending_review',  // Start in review status
      scheduled_for: scheduledTime.toISOString(),
      sent_at: null,
      error_message: null,
    })
  })
  
  // Sort by priority (higher priority first) then by scheduled time
  items.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()
  })
  
  return items
}

// Calculate estimated completion time for a queue
export function estimateCompletionTime(
  itemCount: number,
  settings: Partial<ThrottleSettings>
): { duration: string; endTime: Date } {
  const avgDelay = ((settings.min_delay_seconds || 5) + (settings.max_delay_seconds || 30)) / 2
  const totalSeconds = itemCount * avgDelay
  
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  
  let duration = ''
  if (hours > 0) duration += `${hours}h `
  if (minutes > 0 || hours === 0) duration += `${minutes}m`
  
  const endTime = new Date(Date.now() + totalSeconds * 1000)
  
  return { duration: duration.trim(), endTime }
}

// Format throttle settings for display
export function formatThrottleDisplay(settings: Partial<ThrottleSettings>): string[] {
  return [
    `${settings.emails_per_minute || DEFAULT_THROTTLE_SETTINGS.emails_per_minute} emails/minute`,
    `${settings.emails_per_hour || DEFAULT_THROTTLE_SETTINGS.emails_per_hour} emails/hour`,
    `${settings.emails_per_day || DEFAULT_THROTTLE_SETTINGS.emails_per_day} emails/day`,
    `${settings.min_delay_seconds || DEFAULT_THROTTLE_SETTINGS.min_delay_seconds}-${settings.max_delay_seconds || DEFAULT_THROTTLE_SETTINGS.max_delay_seconds}s delay`,
  ]
}
