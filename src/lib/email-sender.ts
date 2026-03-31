import sgMail from "@sendgrid/mail"

// Uses the same env vars as the Python backend (see /env.example):
//   SENDGRID_API_KEY        - API key from SendGrid
//   SENDGRID_FROM_EMAIL     - verified sender address
//   SENDGRID_FROM_NAME      - display name (optional)
//   SENDGRID_REPLY_TO_EMAIL - reply-to address (optional, defaults to from)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || ""
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "Transparent City"
const SENDGRID_REPLY_TO = process.env.SENDGRID_REPLY_TO_EMAIL || SENDGRID_FROM_EMAIL

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY)
}

/** Returns true if SendGrid env vars are configured and ready to send. */
export function isSendGridConfigured(): boolean {
  return !!(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL)
}

export interface SendEmailParams {
  to: string
  subject: string
  body: string
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!SENDGRID_API_KEY) {
    return {
      success: false,
      error: "SENDGRID_API_KEY is not set. Add it to .env.local (same value as the backend .env).",
    }
  }

  if (!SENDGRID_FROM_EMAIL) {
    return {
      success: false,
      error: "SENDGRID_FROM_EMAIL is not set. Add it to .env.local (same value as the backend .env).",
    }
  }

  if (!params.to || !params.subject || !params.body) {
    return {
      success: false,
      error: "Missing required fields: to, subject, and body are required",
    }
  }

  try {
    const msg: sgMail.MailDataRequired = {
      to: params.to,
      from: {
        email: SENDGRID_FROM_EMAIL,
        name: SENDGRID_FROM_NAME,
      },
      subject: params.subject,
      html: params.body,
      replyTo: params.replyTo || SENDGRID_REPLY_TO,
    }

    const [response] = await sgMail.send(msg)

    return {
      success: true,
      messageId: response.headers?.["x-message-id"] as string || undefined,
    }
  } catch (err) {
    console.error("[SendGrid] Error sending email:", err)
    const errorMessage = err instanceof Error ? err.message : "Unknown SendGrid error"
    return {
      success: false,
      error: errorMessage,
    }
  }
}
