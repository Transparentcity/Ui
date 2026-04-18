import type { Metadata } from "next";
import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";
import "../landing.css";
import "../legal.css";

export const metadata: Metadata = {
  title: "Privacy Policy | Transparent.city",
  description: "Privacy Policy for Transparent.city",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="legal-page">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: April 1, 2026</p>

        <section>
          <h2>1. Who We Are</h2>
          <p>
            Transparent.city is operated by Transparent Technology. This policy
            explains what information we collect, how we use it, and your
            choices.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>

          <h3>Account information</h3>
          <p>
            When you sign up, we collect your email address and any profile
            details you provide. We use this to authenticate you, send
            newsletters you subscribe to, and personalize your experience (such
            as following districts).
          </p>

          <h3>Feedback</h3>
          <p>
            Our feedback widget lets you share reactions and comments. You may
            optionally provide your name and email. We use this to understand
            how the site is working and to improve it.
          </p>

          <h3>Analytics</h3>
          <p>
            We use PostHog and Vercel Analytics to understand how people use the
            site. These tools collect anonymized usage data such as pages
            visited, browser type, and general location. We also use Google
            Analytics for aggregate traffic data.
          </p>

          <h3>Cookies</h3>
          <p>
            We use cookies for authentication sessions and analytics. You can
            control cookies through your browser settings.
          </p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>To provide and improve Transparent.city</li>
            <li>To send newsletters and updates you signed up for</li>
            <li>To respond to feedback and support requests</li>
            <li>To understand usage patterns and improve the experience</li>
            <li>To maintain security and prevent abuse</li>
          </ul>
        </section>

        <section>
          <h2>4. What We Don&apos;t Do</h2>
          <ul>
            <li>We don&apos;t sell your personal information</li>
            <li>We don&apos;t share your email with third parties for marketing</li>
            <li>We don&apos;t track you across other websites</li>
          </ul>
        </section>

        <section>
          <h2>5. Third-Party Services</h2>
          <p>We use the following services that may process some of your data:</p>
          <ul>
            <li>
              <strong>PostHog</strong> for product analytics
            </li>
            <li>
              <strong>Vercel</strong> for hosting and performance analytics
            </li>
            <li>
              <strong>Google Analytics</strong> for aggregate traffic data
            </li>
            <li>
              <strong>SendGrid</strong> for email delivery
            </li>
          </ul>
          <p>
            Each of these services has their own privacy policy governing how
            they handle data.
          </p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We keep your account information as long as you have an account.
            Analytics data is retained in aggregate form. Feedback submissions
            are kept to help us improve the site. You can request deletion of
            your data at any time.
          </p>
        </section>

        <section>
          <h2>7. Your Rights</h2>
          <p>You can:</p>
          <ul>
            <li>Request a copy of the personal data we hold about you</li>
            <li>Ask us to delete your account and associated data</li>
            <li>Unsubscribe from newsletters at any time</li>
            <li>Opt out of analytics by using browser privacy settings or extensions</li>
          </ul>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            We use reasonable measures to protect your information, including
            encrypted connections (HTTPS) and secure authentication. No system
            is perfectly secure, but we take data protection seriously.
          </p>
        </section>

        <section>
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Transparent.city is not directed at children under 13. We don&apos;t
            knowingly collect information from children.
          </p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. We&apos;ll note the
            date of the latest update at the top of the page.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            Questions about your privacy? Reach us at{" "}
            <a href="mailto:seymour@transparent.city">
              seymour@transparent.city
            </a>
            .
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
