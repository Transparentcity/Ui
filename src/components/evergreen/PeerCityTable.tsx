import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TrendArrow from "./TrendArrow";
import type { PeerCityRanking } from "@/lib/evergreen/types";

interface PeerCityTableProps {
  rankings: PeerCityRanking[];
  currentCity: string;
}

export default function PeerCityTable({
  rankings,
  currentCity,
}: PeerCityTableProps) {
  if (rankings.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        How Does {currentCity} Compare?
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Year-over-year crime trend across the 15 major cities we track.
        Negative numbers mean crime is going down.
      </p>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">YoY change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.map((r) => (
              <TableRow
                key={r.citySlug}
                className={cn(
                  r.isCurrentCity &&
                    "bg-purple-50 border-l-2 border-l-purple-500"
                )}
              >
                <TableCell className="font-medium tabular-nums">
                  #{r.rank}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-medium",
                    r.isCurrentCity && "text-purple-700"
                  )}
                >
                  {r.city}
                </TableCell>
                <TableCell className="text-right">
                  <TrendArrow value={r.overallCrimeTrend} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
