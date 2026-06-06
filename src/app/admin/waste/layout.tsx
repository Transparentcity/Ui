import { type ReactNode } from "react";
import { WasteShell } from "@/components/admin/waste/WasteShell";
import "./waste.css";

export const metadata = {
  title: "Waste Module · Transparent.city",
};

export default function WasteLayout({ children }: { children: ReactNode }) {
  return <WasteShell>{children}</WasteShell>;
}
