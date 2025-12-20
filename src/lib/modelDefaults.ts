export const PREFERRED_DEFAULT_MODEL_KEY = "claude-sonnet-4";

export interface ModelInfoLike {
  key: string;
  is_available: boolean;
}

export interface ModelGroupInfoLike {
  models: ModelInfoLike[];
}

/**
 * Pick a sensible default model key.
 *
 * Preference order:
 * 1) preferred model key (if available)
 * 2) any available model
 * 3) preferred model key (even if unavailable)
 * 4) first model in list
 */
export function pickDefaultModelKey(
  groups: ModelGroupInfoLike[],
  preferredKey: string = PREFERRED_DEFAULT_MODEL_KEY
): string | null {
  const allModels: ModelInfoLike[] = [];
  for (const group of groups) {
    for (const model of group.models) {
      allModels.push(model);
    }
  }

  const preferredAvailable = allModels.find(
    (m) => m.key === preferredKey && m.is_available
  );
  if (preferredAvailable) return preferredAvailable.key;

  const anyAvailable = allModels.find((m) => m.is_available);
  if (anyAvailable) return anyAvailable.key;

  const preferred = allModels.find((m) => m.key === preferredKey);
  if (preferred) return preferred.key;

  return allModels.length > 0 ? allModels[0].key : null;
}


