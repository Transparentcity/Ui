"use client";

import { ReactNode } from "react";
import { SignupEmailProvider } from "@/app/c/[slug]/SignupEmailContext";

export default function GetLandingClient({ children }: { children: ReactNode }) {
  return <SignupEmailProvider>{children}</SignupEmailProvider>;
}
