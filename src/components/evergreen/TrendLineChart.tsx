"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from "recharts";
import type { MonthlyDataPoint } from "@/lib/evergreen/types";

interface TrendLineChartProps {
  localData: MonthlyDataPoint[];
  localLabel: string;
  comparisonData?: MonthlyDataPoint[] | null;
  comparisonLabel?: string;
  trendInsight?: string;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(m, 10) - 1]} '${year.slice(2)}`;
}

function findNotablePoint(data: { monthLabel: string; local: number }[]) {
  if (data.length < 3) return null;

  let maxDrop = 0;
  let maxDropIdx = -1;

  for (let i = 1; i < data.length; i++) {
    const drop = data[i - 1].local - data[i].local;
    if (drop > maxDrop) {
      maxDrop = drop;
      maxDropIdx = i;
    }
  }

  if (maxDropIdx === -1 || maxDrop < 1) return null;

  return {
    monthLabel: data[maxDropIdx].monthLabel,
    value: data[maxDropIdx].local,
    label: `Largest monthly drop`,
  };
}

export default function TrendLineChart({
  localData,
  localLabel,
  comparisonData,
  comparisonLabel,
  trendInsight,
}: TrendLineChartProps) {
  const merged = localData.map((point) => {
    const comp = comparisonData?.find((c) => c.month === point.month);
    return {
      month: point.month,
      monthLabel: formatMonth(point.month),
      local: point.value,
      comparison: comp?.value ?? null,
    };
  });

  const notable = findNotablePoint(merged);

  return (
    <section id="trend">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Is It Getting Safer?
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={merged}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line
              type="monotone"
              dataKey="local"
              name={localLabel}
              stroke="#7c3aed"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {comparisonData && comparisonData.length > 0 && (
              <Line
                type="monotone"
                dataKey="comparison"
                name={comparisonLabel ?? "City average"}
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
            {notable && (
              <ReferenceDot
                x={notable.monthLabel}
                y={notable.value}
                r={5}
                fill="#7c3aed"
                stroke="#fff"
                strokeWidth={2}
                label={{
                  value: notable.label,
                  position: "top",
                  fontSize: 10,
                  fill: "#6b7280",
                  offset: 10,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {trendInsight && (
        <p className="mt-3 text-sm text-gray-600 italic">{trendInsight}</p>
      )}
    </section>
  );
}
