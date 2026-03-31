import { buildCTAUrl, type CTAContext } from "@/lib/evergreen/ctaUtils";

interface CTABannerProps {
  headline: string;
  subheadline: string;
  buttonText: string;
  buttonUrl: string;
  secondaryText?: string;
  context: CTAContext;
}

export default function CTABanner({
  headline,
  subheadline,
  buttonText,
  buttonUrl,
  secondaryText,
  context,
}: CTABannerProps) {
  const url = buildCTAUrl(buttonUrl, context);

  return (
    <div className="rounded-lg bg-purple-50 border border-purple-200 p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-900">{headline}</h3>
      <p className="mt-1 text-sm text-gray-600 max-w-lg mx-auto">
        {subheadline}
      </p>
      <a
        href={url}
        className="mt-4 inline-block rounded-md bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
      >
        {buttonText}
      </a>
      {secondaryText && (
        <p className="mt-2 text-xs text-gray-500">{secondaryText}</p>
      )}
    </div>
  );
}
