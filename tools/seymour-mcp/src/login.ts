#!/usr/bin/env node
/**
 * One-time login for the Seymour MCP server using the Auth0 device flow.
 *
 *   npm run login     -> prints a URL + code, waits for browser approval, stores tokens
 *   npm run logout    -> deletes the stored tokens
 */
import { loadConfig, requireClientId } from "./config.js";
import { AuthError, decodeJwtPayload, pollForDeviceToken, requestDeviceCode } from "./auth.js";
import { deleteTokens } from "./tokenStore.js";

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

main().catch((err) => {
  if (err instanceof AuthError) {
    log(`Login failed: ${err.message}`);
  } else {
    log(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
