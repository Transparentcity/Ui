"use client";

import EmailSignInLink from "./EmailSignInLink";

type CityHeroNewsletterProps = {
  cityName: string;
  citySlug?: string;
  district?: number;
  /** Override the default label text shown above the email input */
  label?: string;
};

export default function CityHeroNewsletter({ cityName, label }: CityHeroNewsletterProps) {
  return (
    <EmailSignInLink label={label ?? `To get updates for ${cityName}.`} />
  );
}
