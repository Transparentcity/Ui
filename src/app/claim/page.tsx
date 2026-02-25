"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  listLeadersForClaim,
  createClaim,
  getMyClaims,
  type LeaderForClaim,
  type ClaimResponse,
} from "@/lib/apiClient";

export default function ClaimPage() {
  const searchParams = useSearchParams();
  const cityIdParam = searchParams.get("city_id");
  const districtParam = searchParams.get("district");
  const cityId = cityIdParam ? parseInt(cityIdParam, 10) : null;
  const district = districtParam ? parseInt(districtParam, 10) : null;
  const hasContext = Number.isFinite(cityId) && Number.isFinite(district) && district !== undefined;

  const { isAuthenticated, isLoading: authLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const [leader, setLeader] = useState<LeaderForClaim | null>(null);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [leaderError, setLeaderError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [myClaims, setMyClaims] = useState<ClaimResponse[]>([]);
  const [myClaimsLoading, setMyClaimsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const returnTo = hasContext ? `/claim?city_id=${cityId}&district=${district}` : "/claim";

  const handleSignInToClaim = async () => {
    await loginWithRedirect({
      authorizationParams: {
        screen_hint: "signup",
        prompt: "login",
      },
      appState: { returnTo },
    });
  };

  const loadLeaderForContext = useCallback(async () => {
    if (!hasContext || cityId == null || district == null) {
      setLeader(null);
      return;
    }
    setLeaderLoading(true);
    setLeaderError(null);
    try {
      const list = await listLeadersForClaim(cityId);
      const match = list.find((l) => (l.district ?? 0) === district);
      setLeader(match ?? null);
      if (!match && list.length > 0) {
        setLeaderError("No official found for this district.");
      } else if (!match) {
        setLeaderError("No officials found for this city.");
      }
    } catch {
      setLeader(null);
      setLeaderError("Could not load official.");
    } finally {
      setLeaderLoading(false);
    }
  }, [hasContext, cityId, district]);

  useEffect(() => {
    if (isAuthenticated && hasContext) {
      loadLeaderForContext();
    } else {
      setLeader(null);
      setLeaderError(null);
    }
  }, [isAuthenticated, hasContext, loadLeaderForContext]);

  const loadMyClaims = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const token = await getAccessTokenSilently();
      const list = await getMyClaims(token);
      setMyClaims(list);
    } catch {
      setMyClaims([]);
    } finally {
      setMyClaimsLoading(false);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMyClaims([]);
      setMyClaimsLoading(false);
      return;
    }
    setMyClaimsLoading(true);
    loadMyClaims();
  }, [isAuthenticated, loadMyClaims]);

  const handleSubmitClaim = async () => {
    if (leader == null) return;
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      const token = await getAccessTokenSilently();
      await createClaim(leader.id, token);
      await loadMyClaims();
      setSubmitted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit claim";
      setSubmitError(msg);
    } finally {
      setSubmitLoading(false);
    }
  };

  if (authLoading) {
    return (
      <>
        <Header showCityPicker={false} />
        <main style={{ padding: "2rem", textAlign: "center" }}>Loading…</main>
      </>
    );
  }

  return (
    <>
      <Header showCityPicker={false} />
      <main style={{ padding: "2rem 1.5rem", maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Claim your official profile
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          Elected district officials can claim their profile to verify their identity and, once approved,
          comment and speak to followers on the platform.
        </p>

        {!isAuthenticated ? (
          <div>
            <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
              {hasContext
                ? "Sign in or sign up to claim this official profile. We'll follow up by email to verify your identity."
                : "Sign in or sign up to start the claim process."}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSignInToClaim}
            >
              Sign in to claim your profile
            </button>
          </div>
        ) : hasContext ? (
          <>
            {leaderLoading ? (
              <p style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : leaderError ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{leaderError}</p>
                <Link href="/" className="btn btn-outline" style={{ fontSize: "0.9rem" }}>
                  Back to home
                </Link>
              </div>
            ) : leader ? (
              <section style={{ marginBottom: "2rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Claim this profile</h2>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  You&apos;re claiming: <strong>{leader.name}</strong> – {leader.title}
                  {leader.district != null ? ` District ${leader.district}` : " (at-large)"}.
                </p>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  We&apos;ll follow up by email (Seymour) to collect the information we need to verify your identity. Manual validation is required.
                </p>
                {submitError && (
                  <p style={{ color: "var(--error)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>{submitError}</p>
                )}
                {submitted ? (
                  <p style={{ color: "var(--success)", fontWeight: 500 }}>
                    Claim submitted. We&apos;ll email you to complete verification.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSubmitClaim}
                    disabled={submitLoading}
                  >
                    {submitLoading ? "Submitting…" : "Request verification"}
                  </button>
                )}
              </section>
            ) : null}

            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Your claims</h2>
              {myClaimsLoading ? (
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Loading…</p>
              ) : myClaims.length === 0 ? (
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>You have no claims yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {myClaims.map((c) => (
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
                        {c.leader_name ?? "—"} – {c.leader_title ?? "—"}
                        {c.leader_district != null ? ` District ${c.leader_district}` : ""}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
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
                          {c.status === "pending"
                            ? "Pending review"
                            : c.status === "approved"
                              ? "Approved"
                              : "Rejected"}
                        </span>
                        {c.requested_at && (
                          <> · Requested {new Date(c.requested_at).toLocaleDateString()}</>
                        )}
                      </div>
                      {c.verification_notes && (
                        <div style={{ fontSize: "0.85rem", marginTop: 4, color: "var(--text-muted)" }}>
                          Note: {c.verification_notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            <section style={{ marginBottom: "2rem" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
                To claim your official profile, go to your city or district page and click <strong>Claim my page</strong> next to your name.
              </p>
              <Link href="/" className="btn btn-outline" style={{ fontSize: "0.9rem" }}>
                Find your city
              </Link>
            </section>
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Your claims</h2>
              {myClaimsLoading ? (
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Loading…</p>
              ) : myClaims.length === 0 ? (
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>You have no claims yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {myClaims.map((c) => (
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
                        {c.leader_name ?? "—"} – {c.leader_title ?? "—"}
                        {c.leader_district != null ? ` District ${c.leader_district}` : ""}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
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
                          {c.status === "pending"
                            ? "Pending review"
                            : c.status === "approved"
                              ? "Approved"
                              : "Rejected"}
                        </span>
                        {c.requested_at && (
                          <> · Requested {new Date(c.requested_at).toLocaleDateString()}</>
                        )}
                      </div>
                      {c.verification_notes && (
                        <div style={{ fontSize: "0.85rem", marginTop: 4, color: "var(--text-muted)" }}>
                          Note: {c.verification_notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <p style={{ marginTop: "2rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    </>
  );
}
