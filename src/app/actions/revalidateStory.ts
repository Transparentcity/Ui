"use server";

import { revalidatePath } from "next/cache";

import { isCanonicalStoryPath } from "@/lib/stories/staffModeration";

/** Drop the cached public story page so a hide or delete shows up immediately. */
export async function revalidatePublicStory(path: string): Promise<void> {
  if (!isCanonicalStoryPath(path)) return;
  revalidatePath(path);
}
