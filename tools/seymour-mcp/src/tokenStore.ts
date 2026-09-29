import fs from "node:fs/promises";
import path from "node:path";

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  /** Unix epoch milliseconds when access_token expires. */
  expires_at: number;
  /** Auth0 client id the tokens were issued to; guards against mixing apps. */
  client_id: string;
  audience: string;
}

/** Refresh when fewer than this many ms remain, so a long Seymour call never straddles expiry. */
export const REFRESH_SKEW_MS = 60_000;

export function isExpired(tokens: StoredTokens, now: number = Date.now()): boolean {
  return tokens.expires_at - REFRESH_SKEW_MS <= now;
}

export async function readTokens(tokenPath: string): Promise<StoredTokens | null> {
  try {
    const raw = await fs.readFile(tokenPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.expires_at !== "number" ||
      typeof parsed.client_id !== "string" ||
      typeof parsed.audience !== "string"
    ) {
      return null;
    }
    return parsed as StoredTokens;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Writes the token file readable only by the current user (0600) via a temp file + rename. */
export async function writeTokens(tokenPath: string, tokens: StoredTokens): Promise<void> {
  const dir = path.dirname(tokenPath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${tokenPath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(tokens, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, tokenPath);
}

export async function deleteTokens(tokenPath: string): Promise<boolean> {
  try {
    await fs.unlink(tokenPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
