export interface CTAVariant {
  id: string;
  headline: string;
  subheadline: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  secondaryText?: string;
}

export type PageType = "districtSafe" | "citySafe";
export type CTAPosition =
  | "after_conditions"
  | "before_footer"
  | "sticky_bottom";

export interface CTAPlacement {
  position: CTAPosition;
  component: "EmailCapture" | "CTABanner" | "StickyFooterCTA";
  showOnMobile: boolean;
}

export interface ConversionConfig {
  pageVariants: Record<PageType, string>;
  placements: Record<PageType, CTAPlacement[]>;
  variants: Record<string, CTAVariant>;
  emailCapture: {
    enabled: boolean;
    placeholder: string;
    buttonText: string;
    successMessage: string;
    endpoint: string;
  };
}

export const conversionConfig: ConversionConfig = {
  pageVariants: {
    districtSafe: "safety_alert",
    citySafe: "city_safety",
  },

  placements: {
    districtSafe: [
      {
        position: "after_conditions",
        component: "EmailCapture",
        showOnMobile: true,
      },
      {
        position: "before_footer",
        component: "CTABanner",
        showOnMobile: true,
      },
      {
        position: "sticky_bottom",
        component: "StickyFooterCTA",
        showOnMobile: true,
      },
    ],
    citySafe: [
      {
        position: "after_conditions",
        component: "EmailCapture",
        showOnMobile: true,
      },
      {
        position: "before_footer",
        component: "CTABanner",
        showOnMobile: true,
      },
      {
        position: "sticky_bottom",
        component: "StickyFooterCTA",
        showOnMobile: true,
      },
    ],
  },

  variants: {
    safety_alert: {
      id: "safety_alert",
      headline: "Get a monthly safety update for this district",
      subheadline:
        "We'll email you when crime trends shift, before the local news covers it.",
      ctaButtonText: "Get free updates",
      ctaButtonUrl: "/signup?utm_source=evergreen&utm_content=safety_alert",
      secondaryText: "Free. No credit card.",
    },
    city_safety: {
      id: "city_safety",
      headline: "Track how your city is changing",
      subheadline:
        "Monthly data reports on safety, cleanliness, and neighborhood investment for every city we cover.",
      ctaButtonText: "Start tracking for free",
      ctaButtonUrl: "/signup?utm_source=evergreen&utm_content=city_safety",
      secondaryText: "Free. No credit card.",
    },
  },

  emailCapture: {
    enabled: true,
    placeholder: "Enter your email",
    buttonText: "Get updates",
    successMessage:
      "You're in. We'll send your first update when new data publishes.",
    endpoint: "/api/subscribe",
  },
};
