import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  subtitle?: string;
  className?: string;
}

export default function StatCard({
  label,
  value,
  unit,
  subtitle,
  className,
}: StatCardProps) {
  if (value == null) return null;

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {value}
          {unit && (
            <span className="text-sm font-normal text-gray-500 ml-1">
              {unit}
            </span>
          )}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
