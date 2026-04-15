import { NextResponse } from "next/server"
import { API_BASE } from "@/lib/apiBase"

/**
 * Verify the caller is an authenticated admin by forwarding their
 * Authorization header to the platform's permissions endpoint.
 *
 * Returns null on success, or a 401/403 NextResponse to short-circuit.
 */
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/me/permissions`, {
      headers: { Authorization: authHeader },
    })

    if (!res.ok) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
    }

    const permissions = (await res.json()) as { is_admin?: boolean }
    if (!permissions.is_admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    return null // success
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 })
  }
}
