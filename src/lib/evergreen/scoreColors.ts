export function getScoreDotColor(score: number): string {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 6.5) return "bg-green-500";
  if (score >= 5) return "bg-amber-500";
  if (score >= 3.5) return "bg-orange-500";
  return "bg-red-500";
}
