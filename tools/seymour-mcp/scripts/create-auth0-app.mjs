#!/usr/bin/env node
/**
 * Creates (or reuses) the "Seymour MCP" Native application in Auth0 with
 * exactly the settings the MCP server needs, then prints the Client ID.
 *
 * Needs a Management API token with scopes:
 *   read:clients create:clients update:clients read:resource_servers update:resource_servers
 * Get one from the Auth0 dashboard: Applications > APIs > Auth0 Management API
 * > API Explorer tab > copy the token (it lasts 24 hours). Then:
 *
 *   AUTH0_MGMT_TOKEN=<token> node scripts/create-auth0-app.mjs
 *
 * AUTH0_TENANT_DOMAIN must be the canonical tenant domain shown at the top of
 * the Auth0 dashboard (for example transparentcity.us.auth0.com), not the
 * custom domain auth.transparent.city: the Management API only answers on the
 * canonical one.
 *
 * Optional env: AUTH0_API_IDENTIFIER (default https://api.transparent.city/api),
 *               APP_NAME (default "Seymour MCP").
 */

const token = process.env.AUTH0_MGMT_TOKEN;
if (!token) {
  console.error("AUTH0_MGMT_TOKEN is required. See the header comment for how to get one.");
  process.exit(1);
}
const domain = (process.env.AUTH0_TENANT_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
if (!domain || domain === "auth.transparent.city") {
  console.error("AUTH0_TENANT_DOMAIN must be the canonical tenant domain (e.g. transparentcity.us.auth0.com), not the custom domain.");
  process.exit(1);
}
const apiIdentifier = process.env.AUTH0_API_IDENTIFIER ?? "https://api.transparent.city/api";
const appName = process.env.APP_NAME ?? "Seymour MCP";
const base = `https://${domain}/api/v2`;

async function mgmt(path, method = "GET", body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const desired = {
  name: appName,
  app_type: "native",
  description: "Device-flow login for the Seymour MCP server (Claude Code / Claude Desktop).",
  grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  token_endpoint_auth_method: "none",
  oidc_conformant: true,
  refresh_token: {
    rotation_type: "rotating",
    expiration_type: "expiring",
    token_lifetime: 30 * 24 * 3600,          // absolute: 30 days
    idle_token_lifetime: 14 * 24 * 3600,     // idle: 14 days
    infinite_token_lifetime: false,
    infinite_idle_token_lifetime: false,
    leeway: 30,
  },
};

// 1. Find or create the application.
const existing = (await mgmt("/clients?app_type=native&fields=client_id,name&include_fields=true&per_page=100"))
  .find((c) => c.name === appName);

let client;
if (existing) {
  console.error(`Found existing application "${appName}" (${existing.client_id}); updating its settings.`);
  client = await mgmt(`/clients/${existing.client_id}`, "PATCH", desired);
} else {
  client = await mgmt("/clients", "POST", desired);
  console.error(`Created application "${appName}".`);
}

// 2. Make sure the API issues refresh tokens (offline access) and note its token TTL.
const apis = await mgmt("/resource-servers?per_page=100");
const api = apis.find((r) => r.identifier === apiIdentifier);
if (!api) {
  console.error(`WARNING: no API with identifier ${apiIdentifier} found; refresh tokens may not be issued.`);
} else if (!api.allow_offline_access) {
  await mgmt(`/resource-servers/${api.id}`, "PATCH", { allow_offline_access: true });
  console.error(`Enabled Allow Offline Access on API ${apiIdentifier}.`);
} else {
  console.error(`API ${apiIdentifier} already allows offline access.`);
}

// 3. Report.
console.error("");
console.error("Done. Application settings:");
console.error(`  name:        ${client.name}`);
console.error(`  app_type:    ${client.app_type}`);
console.error(`  grant_types: ${client.grant_types.join(", ")}`);
console.error(`  refresh:     rotating, 30d absolute / 14d idle`);
console.error("");
console.error("Export this before running the MCP login:");
console.log(`export SEYMOUR_AUTH0_CLIENT_ID=${client.client_id}`);
