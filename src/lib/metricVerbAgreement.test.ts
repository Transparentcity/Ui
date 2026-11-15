import { describe, expect, it } from "vitest";
import { hasOrHave } from "./metricVerbAgreement";

describe("hasOrHave", () => {
  it.each([
    // Singular heads
    ["Drug Crime", "has"],
    ["🏠 Burglary", "has"],
    ["⏱️ 911 Response Time — High Priority (Avg Minutes)", "has"],
    ["⏳ Arrest to Conviction (days)", "has"],
    ["💵 Sales Tax Revenue, Inner Richmond", "has"],
    ["🏠 Homelessness Services Spending", "has"],
    ["⚖️ Sustained Police Misconduct", "has"],
    ["📊 Sole-Source Contract Share", "has"],
    // Plural heads
    ["💊 Drug Crime Incidents", "have"],
    ["🏗️ Building Permits Issued", "have"],
    ["✅ 311 Requests Closed Within 7 Days", "have"],
    ["Pothole Requests - Closed", "have"],
    ["🏫 Schools Inspected", "have"],
    ["📞 911 Calls Answered Within 15 Seconds (%)", "have"],
    ["🚨 Emergency Contracts Still Active (Count)", "have"],
    ["Buffalo Active Registered Businesses", "have"],
    ["🏗️ Housing Units in Pipeline", "have"],
    ["Graffiti Removal Requests (311)", "have"],
  ] as const)("%s -> %s", (name, expected) => {
    expect(hasOrHave(name)).toBe(expected);
  });
});
