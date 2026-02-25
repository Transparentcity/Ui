"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import {
  listAdminClaims,
  updateAdminClaim,
  type AdminClaimResponse,
} from "@/lib/apiClient";

export default function ClaimsAdmin() {
  const { getAccessTokenSilently } = useAuth0();
  const [claims, setClaims] = useState<AdminClaimResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const list = await listAdminClaims(token, statusFilter || undefined);
      setClaims(list);
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (claimId: number) => {
    setUpdatingId(claimId);
    try {
      const token = await getAccessTokenSilently();
      await updateAdminClaim(
        claimId,
        { status: "approved", verification_notes: notes[claimId] || undefined },
        token
      );
      await load();
      setNotes((prev) => ({ ...prev, [claimId]: "" }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReject = async (claimId: number) => {
    setUpdatingId(claimId);
    try {
      const token = await getAccessTokenSilently();
      await updateAdminClaim(
        claimId,
        { status: "rejected", verification_notes: notes[claimId] || undefined },
        token
      );
      await load();
      setNotes((prev) => ({ ...prev, [claimId]: "" }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 8px 0", padding: 0, fontSize: "18px" }}>
        Official claims
      </h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "14px" }}>
        Elected officials request verification here. Approve or reject each claim.
      </p>
      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="claims-status-filter" style={{ marginRight: 8, fontSize: "14px" }}>
          Status:
        </label>
        <select
          id="claims-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-primary)" }}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : claims.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No claims match the filter.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {claims.map((c) => (
            <li
              key={c.id}
              style={{
                padding: "12px",
                border: "1px solid var(--border-primary)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {c.leader_name} – {c.leader_title}
                {c.leader_district != null ? ` District ${c.leader_district}` : " (at-large)"}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: 4 }}>
                User: {c.user_email ?? `ID ${c.user_id}`} · City ID: {c.city_id} · Requested{" "}
                {c.requested_at ? new Date(c.requested_at).toLocaleDateString() : "—"}
              </div>
              <div style={{ fontSize: "13px", marginTop: 4 }}>
                Status:{" "}
                <span
                  style={{
                    color:
                      c.status === "approved"
                        ? "var(--success)"
                        : c.status === "rejected"
                          ? "var(--error)"
                          : "var(--text-secondary)",
                  }}
                >
                  {c.status}
                </span>
              </div>
              {(c.status === "pending" || c.verification_notes) && (
                <div style={{ marginTop: 8 }}>
                  <label htmlFor={`notes-${c.id}`} style={{ fontSize: "13px", display: "block", marginBottom: 4 }}>
                    Notes (optional, shown to user if set):
                  </label>
                  <textarea
                    id={`notes-${c.id}`}
                    value={notes[c.id] ?? c.verification_notes ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="Optional message to user"
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: 8,
                      border: "1px solid var(--border-primary)",
                      fontSize: "13px",
                    }}
                  />
                </div>
              )}
              {c.status === "pending" && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleApprove(c.id)}
                    disabled={updatingId === c.id}
                  >
                    {updatingId === c.id ? "Updating…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleReject(c.id)}
                    disabled={updatingId === c.id}
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
