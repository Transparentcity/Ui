"use client";

import { ReactNode } from "react";
import { SignupEmailProvider } from "./SignupEmailContext";

export default function CityPageClient({ children }: { children: ReactNode }) {
  return <SignupEmailProvider>{children}</SignupEmailProvider>;
}
