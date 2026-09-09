"use client";

import { AdminGuard } from "@/components/AdminGuard";
import AdminGuide from "@/components/admin/AdminGuide";

/**
 * In-app home for the city admin field guide. Linked from the admin menu
 * (green avatar → Admin guide). Admin-only; non-admins bounce to /home.
 */
export default function AdminGuidePage() {
  return (
    <AdminGuard>
      <AdminGuide />
    </AdminGuard>
  );
}
