"use client";

import { useState } from "react";

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
}

/**
 * Image component that gracefully hides itself when the image fails to load.
 * Use this instead of raw <img> tags when the image URL may be broken.
 */
export default function SafeImage({ src, alt, className, style, loading }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
