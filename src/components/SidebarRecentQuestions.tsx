"use client";

import { useState } from "react";
import styles from "./SidebarRecentQuestions.module.css";

/** Questions shown when a city is known. {CITY} is replaced at render time. */
const CITY_QUESTIONS = [
  "Which neighborhood in {CITY} is the safest?",
  "What are the crime trends in {CITY}?",
  "How is the budget allocated this year?",
  "Show me 311 complaints by district",
  "What does the drug crime enforcement data show?",
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
  onQuestionClick?: (question: string) => void;
}

export default function SidebarRecentQuestions({
  activeCityName,
  onQuestionClick,
}: SidebarRecentQuestionsProps) {
  const [expanded, setExpanded] = useState(true);

  const questions = activeCityName
    ? CITY_QUESTIONS.map((q) => q.replace("{CITY}", activeCityName))
    : GENERIC_QUESTIONS;

  return (
    <div className={styles.section}>
      <div
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
      >
        <span>Recent Questions</span>
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
