import {
  conversionConfig,
  type PageType,
  type CTAPosition,
} from "@/config/conversionConfig";
import type { CTAContext } from "@/lib/evergreen/ctaUtils";
import EmailCapture from "./EmailCapture";
import CTABanner from "./CTABanner";
import StickyFooterCTA from "./StickyFooterCTA";

interface ConversionSlotProps {
  position: CTAPosition;
  pageType: PageType;
  citySlug: string;
  districtSlug?: string;
}

export default function ConversionSlot({
  position,
  pageType,
  citySlug,
  districtSlug,
}: ConversionSlotProps) {
  const placements = conversionConfig.placements[pageType];
  const placement = placements?.find((p) => p.position === position);
  if (!placement) return null;

  const variantId = conversionConfig.pageVariants[pageType];
  const variant = conversionConfig.variants[variantId];
  if (!variant) return null;

  const context: CTAContext = {
    pageType,
    variantId,
    citySlug,
    districtSlug,
  };

  switch (placement.component) {
    case "EmailCapture":
      return (
        <EmailCapture
          headline={variant.headline}
          subheadline={variant.subheadline}
          citySlug={citySlug}
          districtSlug={districtSlug}
          pageType={pageType}
          variant={variantId}
        />
      );
    case "CTABanner":
      return (
        <CTABanner
          headline={variant.headline}
          subheadline={variant.subheadline}
          buttonText={variant.ctaButtonText}
          buttonUrl={variant.ctaButtonUrl}
          secondaryText={variant.secondaryText}
          context={context}
        />
      );
    case "StickyFooterCTA":
      return (
        <StickyFooterCTA
          buttonText={variant.ctaButtonText}
          buttonUrl={variant.ctaButtonUrl}
          context={context}
        />
      );
    default:
      return null;
  }
}
