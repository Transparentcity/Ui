"use client";

import { useState } from "react";

type NewsletterSignupProps = {
  cityName?: string;
  /** City slug for district-level signup (e.g. "san-francisco"). Pass with district to open newsletter with ?city=slug&district=d */
  citySlug?: string;
  /** District number for district-level newsletter. Pass with citySlug to open newsletter with ?city=slug&district=d */
  district?: number;
  /** Optional callback when email changes - used to sync with signup button */
  onEmailChange?: (email: string) => void;
};

export default function NewsletterSignup({ cityName, citySlug, district, onEmailChange }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    onEmailChange?.(newEmail);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      let newsletterUrl = "https://www.transparentsf.com";
      if (citySlug && district != null) {
        const params = new URLSearchParams({ city: citySlug, district: String(district) });
        newsletterUrl = `https://www.transparentsf.com?${params.toString()}`;
      } else if (citySlug) {
        newsletterUrl = `https://www.transparentsf.com?city=${encodeURIComponent(citySlug)}`;
      }
      window.open(newsletterUrl, "_blank");
      setStatus("success");
      setEmail("");
    } catch (error) {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="newsletter-signup">
      <div className="newsletter-signup-content">
        <label htmlFor="newsletter-email" className="newsletter-label">
          Get monthly updates for {cityName ? cityName : "your city"}
        </label>
        <div className="newsletter-input-group">
          <input
            id="newsletter-email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="Enter your email"
            className="newsletter-input"
            required
            disabled={isSubmitting}
          />
          <button
            type="submit"
            className="btn btn-primary newsletter-button"
            disabled={isSubmitting || !email}
          >
            {isSubmitting ? "..." : "Sign up"}
          </button>
        </div>
        {status === "success" && (
          <p className="newsletter-success">
            Opening newsletter signup page...
          </p>
        )}
        {status === "error" && (
          <p className="newsletter-error">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </form>
  );
}










