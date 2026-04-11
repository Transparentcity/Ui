"use client";

import { useAuth0 } from "@auth0/auth0-react";
import EmailSignInLink from "./EmailSignInLink";

type CityHeroNewsletterProps = {
  cityName: string;
  citySlug?: string;
  district?: number;
  /** Override the default label text shown above the email input */
  label?: string;
  /** When true, wraps the EmailSignInLink in a styled container with heading text */
  withContainer?: boolean;
  /** Display name for the city (used in container subtitle) */
  cityDisplay?: string;
  /** Override the container heading (default: "Get stories like this once a week") */
  containerHeading?: string;
  /** Override the container subtitle */
  containerSubtitle?: string;
};

export default function CityHeroNewsletter({
  cityName,
  cityDisplay,
  label,
  withContainer,
  containerHeading,
  containerSubtitle,
}: CityHeroNewsletterProps) {
  const { isAuthenticated } = useAuth0();

  if (isAuthenticated) return null;

  if (withContainer) {
    return (
      <div style={{
        margin: "32px 0",
        padding: "24px",
        borderRadius: 12,
        background: "var(--bg-secondary, #f5f5f5)",
      }}>
        <p style={{
          fontSize: 15,
          fontWeight: 600,
          margin: "0 0 4px",
          color: "var(--text-primary)",
        }}>
          {containerHeading ?? "Sign up now, get your first newsletter this week"}
        </p>
        <p style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: "0 0 8px",
        }}>
          {containerSubtitle ?? `${cityDisplay ?? cityName}\u2019s public data, explained. Crime trends, housing, city services, and more.`}
        </p>
        <EmailSignInLink label={label ?? `To get updates for ${cityName}`} />
      </div>
    );
  }

  return (
    <EmailSignInLink label={label ?? `To get updates for ${cityName}`} />
  );
}
