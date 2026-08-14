"use client";

import { useState } from "react";
import styles from "./SidebarRecentQuestions.module.css";

/** Questions shown when a city is known and user is a regular resident. {CITY} is replaced at render time. */
const CITY_QUESTIONS = [
  "Which neighborhood in {CITY} is the safest?",
  "What are the crime trends in {CITY}?",
  "How is the budget allocated this year?",
  "Show me 311 complaints by district",
  "What does the drug crime enforcement data show?",
];

/** Questions for elected officials — district-first, city context. {CITY} and {DISTRICT} are replaced. */
const ELECTED_OFFICIAL_QUESTIONS = [
  "What improved in District {DISTRICT} this week?",
  "How does District {DISTRICT} compare to the {CITY} citywide average?",
  "What are the 311 service trends in District {DISTRICT}?",
  "Show me housing and permit activity in District {DISTRICT}",
  "What budget items are tracking off-plan in {CITY}?",
];

/** Questions for city staff — citywide operational. {CITY} is replaced. */
const CITY_STAFF_QUESTIONS = [
  "Which {CITY} metrics improved most this week?",
  "What are the 311 resolution rate trends citywide?",
  "Show me spending and budget variance for {CITY}",
  "What are the biggest permit activity movers this month?",
  "Which service-level metrics need attention in {CITY}?",
];

/** Questions shown when no city is selected or available. */
const GENERIC_QUESTIONS = [
  "Which cities does Transparent City cover?",
  "How does Transparent City get its data?",
  "What kind of stories will I see in my feed?",
  "How are safety scores calculated?",
  "What can I learn about my neighborhood?",
];

interface SidebarRecentQuestionsProps {
  activeCityName?: string | null;
  isGovernmentVerified?: boolean;
  governmentUserType?: string | null;
  governmentDistrict?: number | null;
  onQuestionClick?: (question: string) => void;
}

export default function SidebarRecentQuestions({
  activeCityName,
  isGovernmentVerified,
  governmentUserType,
  governmentDistrict,
  onQuestionClick,
}: SidebarRecentQuestionsProps) {
  const [expanded, setExpanded] = useState(true);

  let questions: string[];
  let sectionLabel = "Suggested questions";

  if (isGovernmentVerified && activeCityName) {
    if (governmentUserType === "elected_official" && governmentDistrict) {
      questions = ELECTED_OFFICIAL_QUESTIONS.map((q) =>
        q
          .replace("{CITY}", activeCityName)
          .replace("{DISTRICT}", String(governmentDistrict))
      );
      sectionLabel = `District ${governmentDistrict} questions`;
    } else {
      questions = CITY_STAFF_QUESTIONS.map((q) =>
        q.replace("{CITY}", activeCityName)
      );
      sectionLabel = "City data questions";
    }
  } else if (activeCityName) {
    questions = CITY_QUESTIONS.map((q) => q.replace("{CITY}", activeCityName));
    sectionLabel = "Suggested questions";
  } else {
    questions = GENERIC_QUESTIONS;
    sectionLabel = "Suggested questions";
  }

  return (
    <div className={styles.section}>
      <div
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
      >
        <span>{sectionLabel}</span>
        <span className={styles.chevron}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && (
        <div className={styles.list}>
          {questions.map((q, i) => (
            <button
              key={i}
              className={styles.questionItem}
              onClick={() => onQuestionClick?.(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
