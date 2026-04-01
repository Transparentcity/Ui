"use client";

import { useAuth0 } from "@auth0/auth0-react";
import type { ReactNode } from "react";

type Props = {
  cardGrid: ReactNode;
  tableView: ReactNode;
};

export default function DashboardSwitch({ cardGrid, tableView }: Props) {
  const { isAuthenticated } = useAuth0();
  return <>{isAuthenticated ? tableView : cardGrid}</>;
}
