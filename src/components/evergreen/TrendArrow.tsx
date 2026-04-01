import { cn } from "@/lib/utils";

interface TrendArrowProps {
  value: number; // % change, negative = improvement
  className?: string;
}

export default function TrendArrow({ value, className }: TrendArrowProps) {
  if (value === 0) {
    return (
      <span className={cn("text-gray-500 text-sm font-medium", className)}>
        flat
      </span>
    );
  }

  const isImproving = value < 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        isImproving ? "text-emerald-600" : "text-red-600",
        className
      )}
    >
      <span aria-hidden>{isImproving ? "\u2193" : "\u2191"}</span>
      {Math.abs(value)}%
    </span>
  );
}
