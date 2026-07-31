import { redirect } from "next/navigation";

/**
 * The Applause dashboard has been retired.
 * Admin story curation now uses the Like button on the Feed admin surface.
 */
export default function ApplausePage() {
  redirect("/");
}
