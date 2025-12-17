"use client";

import { useState } from "react";

type NewsletterSignupProps = {
  cityName?: string;
};

export default function NewsletterSignup({ cityName }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setIsSubmitting(true);
    setStatus("idle");

    try {
      // Open newsletter site in new tab for signup
      const newsletterUrl = "https://www.transparentsf.com";
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
            onChange={(e) => setEmail(e.target.value)}
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

