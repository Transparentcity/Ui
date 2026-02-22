export const FOLLOW_UP_ACTION_OPTIONS = [
  { value: "none", label: "No action needed" },
  { value: "no_response", label: "No Response (status check)" },
  { value: "narrow_request", label: "Revise request (narrow scope)" },
  { value: "generate_response", label: "Draft a response email" },
  { value: "pickup_data", label: "Go pick up data" },
  { value: "status_update", label: "Note status update" },
  { value: "no_records", label: "Handle 'no records' response" },
  { value: "partial_no_records", label: "Follow up with remaining depts" },
  { value: "pay_fee", label: "Pay copying/mailing fee" },
  { value: "appeal", label: "Appeal denial or exemption" },
] as const

export const FOLLOW_UP_CLASSIFICATION_TO_ACTION: Record<string, string> = {
  no_response: "no_response",
  narrow_request: "narrow_request",
  pickup_instructions: "pickup_data",
  no_records: "no_records",
  partial_no_records: "partial_no_records",
  status_update: "status_update",
  data_delivery: "none",
  acknowledgment: "none",
  clarification: "narrow_request",
  fee_notice: "pay_fee",
  fee_estimate: "pay_fee",
  denial: "appeal",
  exemption: "appeal",
  extension: "status_update",
  reroute: "status_update",
  follow_up: "generate_response",
}

const ACTION_TO_TASK_TYPE: Record<string, string> = {
  no_response: "no_response",
  narrow_request: "narrow_request",
  pickup_data: "pickup_data",
  generate_response: "send_response",
  status_update: "general_followup",
  no_records: "general_followup",
  partial_no_records: "follow_up_partial",
  pay_fee: "pay_fee",
  appeal: "appeal_denial",
  none: "general_followup",
}

const ACTION_TO_TASK_TITLE: Record<string, string> = {
  no_response: "No response - send status check email",
  narrow_request: "Revise & narrow the original request",
  pickup_data: "Pick up data (see instructions)",
  generate_response: "Draft and send response email",
  status_update: "Review status update",
  no_records: "Review 'no records' response & determine next steps",
  partial_no_records: "Follow up with remaining departments still searching",
  pay_fee: "Pay copying/mailing fee to receive records",
  appeal: "Appeal denial or exemption claim",
  none: "Follow up on interaction",
}

export function getFollowUpTaskSpec(action?: string): { type: string; title: string } {
  const key = action || "none"
  return {
    type: ACTION_TO_TASK_TYPE[key] || "general_followup",
    title: ACTION_TO_TASK_TITLE[key] || "Follow up on interaction",
  }
}

export function buildNoResponseTaskPayload(requestId: number, reason: string, days = 10) {
  const due = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  return {
    request_id: requestId,
    type: "no_response",
    title: "No response - send 10-day status check",
    description: reason,
    due_at: due,
  }
}

export function isNarrowingSignal(input: {
  direction?: string
  classification?: string
  subject?: string
  emailSnippet?: string
  body?: string
}): boolean {
  if (input.direction && input.direction !== "inbound") return false
  if (input.classification === "narrow_request" || input.classification === "clarification") return true
  const text = `${input.subject || ""}\n${input.emailSnippet || ""}\n${input.body || ""}`.toLowerCase()
  return /\bnarrow\b|\btoo broad\b|\bvoluminous\b/.test(text)
}

export const FOLLOW_UP_QUICK_INSERTS: { label: string; text: string }[] = [
  {
    label: "Narrow request: too broad / voluminous",
    text:
      "Your request is too broad/voluminous. Please narrow it by date range, scope, and specific record types.",
  },
  {
    label: "Need date range",
    text: "Please provide a specific date range for the records requested.",
  },
  {
    label: "Need incident/case/CAD number",
    text: "Please provide an incident number, case number, CAD number, or other identifying reference.",
  },
  {
    label: "Need location/address details",
    text: "Please provide the relevant address, location, or intersection to help identify responsive records.",
  },
  {
    label: "Need department/unit clarification",
    text: "Please specify the department, bureau, or unit you want us to search.",
  },
  {
    label: "Need record type clarification",
    text: "Please clarify which record types you want (for example: call logs, incident reports, CAD notes, audio, or video).",
  },
  {
    label: "Need subject/person identifiers",
    text: "Please provide names, badge numbers, report numbers, or other identifiers to narrow the search.",
  },
  {
    label: "Need delivery format preference",
    text: "Please confirm your preferred format for responsive records (electronic copies, inspection, or hard copies).",
  },
  {
    label: "Need clearer scope/exclusions",
    text: "Please clarify the exact scope of records requested and any exclusions so we can process your request.",
  },
  {
    label: "Need contact details for follow-up",
    text: "Please provide the best email and/or phone number so we can contact you with clarifications.",
  },
]
