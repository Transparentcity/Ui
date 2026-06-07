"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import type {
  ProductAnalyticsRetentionLagTable,
  RetentionLagCellUser,
} from "@/lib/apiClient";
import {
  getRetentionLagCellUsers,
  getRetentionLagActiveDayUsers,
} from "@/lib/apiClient";
import styles from "./RetentionLagTable.module.css";

function pct(rate: number | null | undefined): string {
  if (rate == null || !isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type CellSelection =
  | { kind: "active"; date: string }
  | { kind: "lag"; date: string; lag: number };

interface CellDetailModalProps {
  selection: CellSelection;
  onClose: () => void;
}

function CellDetailModal({ selection, onClose }: CellDetailModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [users, setUsers] = useState<RetentionLagCellUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUsers(null);

    const fetch =
      selection.kind === "active"
        ? getAccessTokenSilently().then((token) =>
            getRetentionLagActiveDayUsers(token, selection.date)
          )
        : getAccessTokenSilently().then((token) =>
            getRetentionLagCellUsers(token, selection.date, selection.lag)
          );

    fetch
      .then((res) => {
        if (!cancelled) setUsers(res.users);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    getAccessTokenSilently,
    selection.kind,
    selection.date,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    selection.kind === "lag" ? selection.lag : 0,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const title =
    selection.kind === "active"
      ? `Active · ${shortDate(selection.date)}`
      : `L${selection.lag}/7 · ${shortDate(selection.date)}`;

  const subtitle =
    selection.kind === "active"
      ? `All logged-in users active on ${shortDate(selection.date)}`
      : `Users active on this day who were also active ${selection.lag} day${selection.lag !== 1 ? "s" : ""} earlier`;

  if (!mounted) return null;

  const content = (
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className={styles.modalDialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{title}</div>
            <div className={styles.modalSubtitle}>{subtitle}</div>
          </div>
          <button
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>
          {loading && <p className={styles.modalStatus}>Loading&hellip;</p>}
          {error && <p className={styles.modalError}>{error}</p>}
          {!loading && !error && users !== null && users.length === 0 && (
            <p className={styles.modalStatus}>No users found.</p>
          )}
          {!loading && !error && users !== null && users.length > 0 && (
            <ul className={styles.userList}>
              {users.map((u, i) => {
                const full =
                  [u.first_name, u.last_name].filter(Boolean).join(" ") ||
                  u.name ||
                  "Unknown";
                return (
                  <li key={i} className={styles.userRow}>
                    <span className={styles.userName}>{full}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={styles.modalFooter}>
          <span className={styles.modalCount}>
            {!loading && users !== null
              ? `${users.length} user${users.length !== 1 ? "s" : ""}`
              : ""}
          </span>
          <button className={styles.modalCloseBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

interface RetentionLagTableProps {
  table: ProductAnalyticsRetentionLagTable;
}

export default function RetentionLagTable({ table }: RetentionLagTableProps) {
  const [selected, setSelected] = useState<CellSelection | null>(null);

  if (!table.rows.length) {
    return (
      <p className={styles.empty}>Not enough activity in the last 7 days.</p>
    );
  }

  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.caption}>
          Last 7 days through {table.date_to}. Lk/7 = users active that day who
          were also active k days earlier (count and % of that day&apos;s
          actives). Click any number to see who.
        </p>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDay}>Day</th>
                <th className={styles.thActive}>Active</th>
                {Array.from({ length: 7 }, (_, i) => (
                  <th key={i} className={styles.thLag}>
                    L{i + 1}/7
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                const activeSelected =
                  selected?.kind === "active" && selected.date === row.date;
                return (
                  <tr key={row.date}>
                    <td className={styles.tdDay}>{shortDate(row.date)}</td>
                    <td
                      className={[
                        styles.tdActive,
                        row.active > 0 ? styles.tdActiveClickable : "",
                        activeSelected ? styles.tdLagSelected : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={
                        row.active > 0
                          ? () => setSelected({ kind: "active", date: row.date })
                          : undefined
                      }
                      title={
                        row.active > 0
                          ? `Click to see the ${row.active} active user${row.active !== 1 ? "s" : ""}`
                          : undefined
                      }
                    >
                      {row.active.toLocaleString()}
                    </td>
                    {row.cells.map((cell) => {
                      const clickable =
                        row.active > 0 && cell.rate != null && cell.count > 0;
                      const isSelected =
                        selected?.kind === "lag" &&
                        selected.date === row.date &&
                        selected.lag === cell.lag;
                      return (
                        <td
                          key={cell.lag}
                          className={[
                            styles.tdLag,
                            clickable ? styles.tdLagClickable : "",
                            isSelected ? styles.tdLagSelected : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={
                            clickable
                              ? () =>
                                  setSelected({
                                    kind: "lag",
                                    date: row.date,
                                    lag: cell.lag,
                                  })
                              : undefined
                          }
                          title={
                            clickable
                              ? `Click to see the ${cell.count} user${cell.count !== 1 ? "s" : ""}`
                              : undefined
                          }
                        >
                          {row.active > 0 && cell.rate != null ? (
                            <>
                              <span className={styles.count}>{cell.count}</span>
                              <span className={styles.pct}>{pct(cell.rate)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <CellDetailModal
          selection={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
