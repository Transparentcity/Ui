#!/usr/bin/env node

/**
 * Print the production callback URL and web origin for Auth0.
 * Use this to copy into Auth0 Dashboard → Application → Allowed Callback URLs / Allowed Web Origins.
 * Does not read or print any secrets.
 */

const PRODUCTION_ORIGIN = "https://app.transparent.city";
const AUTH_DOMAIN = "auth.transparent.city";

console.log("Auth0 Application URIs for production (app.transparent.city)\n");
console.log("Auth domain: " + AUTH_DOMAIN + " (set NEXT_PUBLIC_AUTH0_DOMAIN for the UI)\n");
console.log("Add these in Auth0 Dashboard → Applications → [Your App] → Settings → Application URIs:\n");
console.log("Allowed Callback URLs (one per line):");
console.log("  " + PRODUCTION_ORIGIN);
console.log("\nAllowed Web Origins:");
console.log("  " + PRODUCTION_ORIGIN);
console.log("\nAllowed Logout URLs (optional):");
console.log("  " + PRODUCTION_ORIGIN);
console.log("\nIf login hangs at Auth0, the most common fix is adding the above Callback URL and Web Origins.");
console.log("See docs/PRODUCTION_AUTH0_LOGIN.md for full steps and Auth0 CLI usage.\n");
