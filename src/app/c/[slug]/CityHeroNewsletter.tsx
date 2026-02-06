"use client";

import NewsletterSignup from "@/components/NewsletterSignup";
import { useSignupEmail } from "./SignupEmailContext";

type CityHeroNewsletterProps = {
  cityName: string;
  citySlug?: string;
  district?: number;
};

export default function CityHeroNewsletter({ cityName, citySlug, district }: CityHeroNewsletterProps) {
  const { setEmail } = useSignupEmail();

  return (
    <NewsletterSignup
      cityName={cityName}
      citySlug={citySlug}
      district={district}
      onEmailChange={setEmail}
    />
  );
}
