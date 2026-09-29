#!/usr/bin/env node
/**
 * One-time login for the Seymour MCP server using the Auth0 device flow.
 *
 *   npm run login            -> prints a URL + code, waits for browser approval, stores tokens
 *   npm run login -- --token  -> reads an access token you paste on stdin (stopgap, no refresh)
 *   npm run logout           -> deletes the stored tokens
 */
import { loadConfig, requireClientId } from "./config.js";
import { AuthError, decodeJwtPayload, pollForDeviceToken, requestDeviceCode } from "./auth.js";
import { deleteTokens, writeTokens } from "./tokenStore.js";

const log = (line: string) => process.stderr.write(line + "\n");

async function main(): Promise<void> {
  const config = loadConfig();
  const args = new Set(process.argv.slice(2));

  if (args.has("--logout")) {
    const removed = await deleteTokens(config.tokenPath);
    log(removed ? `Removed ${config.tokenPath}` : `No token file at ${config.tokenPath}`);
    log("To fully revoke access, also delete the grant in Auth0 (User > Authorized Applications).");
    return;
  }

  if (args.has("--token")) {
    await storePastedToken(config);
    return;
  }

  requireClientId(config);
  log(`Auth0 tenant: ${config.auth0Domain}`);
  log(`API audience: ${config.auth0Audience}`);

  const device = await requestDeviceCode(config);
  log("");
  log("Open this URL in your browser and confirm the code:");
  log(`  ${device.verification_uri_complete}`);
  log(`  code: ${device.user_code}`);
  log("");
  log(`Waiting for approval (expires in ${Math.round(device.expires_in / 60)} min)...`);

  const tokens = await pollForDeviceToken(config, device, log);
  const claims = decodeJwtPayload(tokens.access_token) ?? {};
  const who =
    (claims["https://transparent.city/email"] as string | undefined) ??
    (claims.email as string | undefined) ??
    (claims.sub as string | undefined) ??
    "unknown";
  log("");
  log(`Logged in as ${who}.`);
  log(`Tokens stored at ${config.tokenPath} (mode 0600).`);
  if (!tokens.refresh_token) {
    log(
      "WARNING: no refresh token was issued. Enable the Refresh Token grant on the Auth0 application " +
        "and allow Offline Access on the API, or you will need to log in again every day."
    );
  }
}

/**
 * Stopgap for using the server before the Auth0 Native app exists: paste the
 * bearer token the web app already uses. It is read from stdin so it never
 * lands in shell history. No refresh token, so this must be repeated when it
 * expires.
 */
async function storePastedToken(config: ReturnType<typeof loadConfig>): Promise<void> {
  log("Paste your Transparent City access token, then press Enter (and Ctrl-D if needed).");
  log("Where to find it: app.transparent.city, DevTools, Network tab, any request to /api/,");
  log("Request Headers, the value after \"Authorization: Bearer\".");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const token = Buffer.concat(chunks).toString("utf8").trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("No token received on stdin.", "empty_token");

  const claims = decodeJwtPayload(token);
  if (!claims || typeof claims.exp !== "number") {
    throw new AuthError("That does not look like a JWT access token (no exp claim).", "bad_token");
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(config.auth0Audience)) {
    log(`WARNING: token audience ${JSON.stringify(claims.aud)} does not include ${config.auth0Audience}; the API may reject it.`);
  }
  const expiresAt = claims.exp * 1000;
  if (expiresAt <= Date.now()) {
    throw new AuthError("That token has already expired. Reload the web app and copy a fresh one.", "expired_token");
  }

  await writeTokens(config.tokenPath, {
    access_token: token,
    expires_at: expiresAt,
    client_id: config.auth0ClientId,
    audience: config.auth0Audience,
  });
  const who =
    (claims["https://transparent.city/email"] as string | undefined) ??
    (claims.email as string | undefined) ??
    (claims.sub as string | undefined) ??
    "unknown";
  log(`Stored token for ${who} at ${config.tokenPath} (mode 0600).`);
  log(`It expires ${new Date(expiresAt).toISOString()}. No refresh token: run this again after that,`);
  log("or set up the Auth0 app (README step 1) for a login that renews itself.");
}

main().catch((err) => {
  if (err instanceof AuthError) {
    log(`Login failed: ${err.message}`);
  } else {
    log(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
