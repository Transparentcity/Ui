"use client";

import EmailSignInLink from "./EmailSignInLink";

type CityHeroNewsletterProps = {
  cityName: string;
  citySlug?: string;
  district?: number;
};

export default function CityHeroNewsletter({ cityName }: CityHeroNewsletterProps) {
  return (
    <EmailSignInLink label={`To get updates for ${cityName}.`} />
  );
}
