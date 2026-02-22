"use client";

import { useState } from "react";
import UserMetricOrderDialog, {
  type UserMetricOrderDialogMetric,
} from "@/components/UserMetricOrderDialog";

type Props = {
  cityId: number;
  cityName: string;
  metrics: UserMetricOrderDialogMetric[];
};

export default function CustomizeMetricsTrigger({
  cityId,
  cityName,
  metrics,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hero-category-link"
        style={{ marginTop: 8 }}
      >
        Customize metrics
      </button>
      <UserMetricOrderDialog
        cityId={cityId}
        cityName={cityName}
        metrics={metrics}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
