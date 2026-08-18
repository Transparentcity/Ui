import { describe, expect, it } from "vitest";
import type { NewsletterEvalResultDetail } from "@/lib/apiClient";
import {
  evalCellPatch,
  evalMatchesPendingRow,
} from "./NewsletterEvalResultDetailPane";

function detail(
  overrides: Partial<NewsletterEvalResultDetail> = {}
): NewsletterEvalResultDetail {
  return {
    id: 15,
    batch_id: 8,
    source: "imported",
    source_ref: "98",
    persona_id: null,
    persona_label: "Imported: rgoldman+gov@…",
    model_key: "claude-sonnet-4.6",
    prompt_variant_label: "imported",
    has_prompt_override: false,
    status: "completed",
    error: null,
    subject: "2,126 noise complaints near your block in 2026",
    llm_usage: null,
    run_telemetry: null,
    stats_json: { word_count: 812 },
    judge_model_key: "claude-sonnet-4.6",
    judge_scores: {
      dimensions: {
        accuracy: { score: 2, rationale: "", evidence: [], errors: ["wrong week"] },
      },
      overall: { score: 2, verdict: "one date error" },
      top_issues: [],
      fabrication_capped: true,
    },
    judge_usage: null,
    session_id: null,
    created_at: "2026-08-17T02:00:00Z",
    completed_at: "2026-08-17T02:00:31Z",
    has_html: true,
    persona_prompt: null,
    prompt_override: null,
    body_html: "<p>hi</p>",
    stories_block: null,
    plan_json: null,
    ...overrides,
  };
}

describe("evalCellPatch", () => {
  it("carries the fields a re-judge can change", () => {
    const patch = evalCellPatch(detail());
    expect(patch.judge_scores?.overall.score).toBe(2);
    expect(patch.subject).toBe("2,126 noise complaints near your block in 2026");
    expect(patch.judge_model_key).toBe("claude-sonnet-4.6");
    expect(patch.stats_json).toEqual({ word_count: 812 });
  });

  it("omits body and plan so list rows stay lightweight", () => {
    expect(evalCellPatch(detail())).not.toHaveProperty("body_html");
    expect(evalCellPatch(detail())).not.toHaveProperty("plan_json");
  });
});

describe("evalMatchesPendingRow", () => {
  it("matches an imported eval to its pending send via source_ref", () => {
    expect(evalMatchesPendingRow({ id: 98, eval_result_id: null }, detail())).toBe(
      true
    );
    expect(evalMatchesPendingRow({ id: 93, eval_result_id: null }, detail())).toBe(
      false
    );
  });

  it("falls back to eval_result_id for generated cells", () => {
    const generated = detail({ source: "generated", source_ref: null });
    expect(evalMatchesPendingRow({ id: 1, eval_result_id: 15 }, generated)).toBe(true);
    expect(evalMatchesPendingRow({ id: 1, eval_result_id: 14 }, generated)).toBe(false);
  });

  it("never matches an unsaved preview (id 0) against rows without an eval", () => {
    const preview = detail({ id: 0, source: "generated", source_ref: null });
    expect(evalMatchesPendingRow({ id: 98, eval_result_id: null }, preview)).toBe(false);
    expect(evalMatchesPendingRow({ id: 98 }, preview)).toBe(false);
  });

  it("ignores a non-numeric source_ref", () => {
    const odd = detail({ source_ref: "not-a-number" });
    expect(evalMatchesPendingRow({ id: 98, eval_result_id: 15 }, odd)).toBe(true);
    expect(evalMatchesPendingRow({ id: 98, eval_result_id: null }, odd)).toBe(false);
  });
});
