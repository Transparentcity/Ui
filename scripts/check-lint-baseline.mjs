#!/usr/bin/env node
/**
 * Compare current ESLint violation counts to the baseline. Fail if either
 * the error count or the warning count grew. Use this as the CI gate so the
 * lint debt monotonically decreases.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const baselinePath = resolve(repoRoot, ".eslint-baseline.json");

function runEslintJson() {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(
      "npx",
      ["eslint", ".", "--format=json"],
      { cwd: repoRoot, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", rejectRun);
    proc.on("close", () => {
      // ESLint exits non-zero when there are errors. We still want the JSON.
      try {
        const parsed = JSON.parse(stdout);
        resolveRun(parsed);
      } catch (err) {
        rejectRun(new Error(`eslint output parse failed: ${err.message}\n--- stderr ---\n${stderr}`));
      }
    });
  });
}

function tally(results) {
  let errors = 0;
  let warnings = 0;
  for (const r of results) {
    errors += r.errorCount || 0;
    warnings += r.warningCount || 0;
  }
  return { errors, warnings };
}

const updateMode = process.argv.includes("--update");

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const results = await runEslintJson();
const current = tally(results);

console.log(`current: ${current.errors} errors, ${current.warnings} warnings`);
console.log(`baseline: ${baseline.errors} errors, ${baseline.warnings} warnings`);

if (updateMode) {
  if (current.errors > baseline.errors || current.warnings > baseline.warnings) {
    console.error("refusing to update baseline upward; fix issues or revert");
    process.exit(1);
  }
  const next = {
    ...baseline,
    errors: current.errors,
    warnings: current.warnings,
    captured_at: new Date().toISOString().slice(0, 10),
  };
  await writeFile(baselinePath, JSON.stringify(next, null, 2) + "\n");
  console.log(`baseline updated to ${current.errors}/${current.warnings}`);
  process.exit(0);
}

const grew = [];
if (current.errors > baseline.errors) {
  grew.push(`errors ${baseline.errors} -> ${current.errors}`);
}
if (current.warnings > baseline.warnings) {
  grew.push(`warnings ${baseline.warnings} -> ${current.warnings}`);
}
if (grew.length > 0) {
  console.error(`lint debt grew: ${grew.join(", ")}`);
  console.error("either fix the new violations or, if you intentionally lowered the bar, run scripts/check-lint-baseline.mjs --update with reviewer signoff");
  process.exit(1);
}

const dropped = [];
if (current.errors < baseline.errors) {
  dropped.push(`errors -${baseline.errors - current.errors}`);
}
if (current.warnings < baseline.warnings) {
  dropped.push(`warnings -${baseline.warnings - current.warnings}`);
}
if (dropped.length > 0) {
  console.log(`nice: ${dropped.join(", ")}. run scripts/check-lint-baseline.mjs --update to lower the bar.`);
}
console.log("lint debt within baseline");
