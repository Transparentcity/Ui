# Seymour MCP server

A small [MCP](https://modelcontextprotocol.io) server that lets Claude Code and
Claude Desktop talk to Seymour, Transparent City's data agent, using your own
Transparent City login. It wraps the existing chat API at
`api.transparent.city`; nothing in the backend or the web UI changes.

Tools exposed to Claude:

| Tool | What it does |
|------|--------------|
| `seymour_ask` | Send a message to Seymour and get the full answer. Pass `session_id` to continue a conversation. |
| `seymour_list_sessions` | List your recent Seymour sessions. |
| `seymour_get_session` | Fetch one session's transcript and cost stats. |
| `seymour_auth_status` | Show who you are logged in as and when the token expires. |

By default new sessions get the `core`, `research` and `web_search` tool
groups. `email` and `foia` are never enabled unless Claude passes them
explicitly in `tool_groups`, so a casual question can never trigger Send Email.

## How auth works

The server never holds a shared secret. It uses the Auth0 device
authorization flow: you approve a code once in your browser, Auth0 issues a
user access token plus a refresh token, and the server stores them in
`~/.config/seymour-mcp/tokens.json` with mode `0600`. Access tokens are
refreshed silently before they expire. Every call to the API is made as you,
with the same permissions you have on the site. Revoke access at any time by
running `npm run logout` and deleting the grant under your user in the Auth0
dashboard.

## Quick start without any Auth0 setup

If you just want to try it now, reuse the access token the web app already
has. It expires (usually within 24 hours) and cannot be refreshed, so this is
a stopgap; the Auth0 app below gives you a login that renews itself.

```bash
cd tools/seymour-mcp
npm install && npm run build
npm run login -- --token     # paste the token when prompted, then Enter and Ctrl-D
claude mcp add --scope user --transport stdio seymour -- node "$PWD/dist/index.js"
```

To find the token: open app.transparent.city while logged in, open DevTools,
Network tab, click any request to `/api/`, and copy the value after
`Authorization: Bearer` in the request headers. The token is read from stdin
so it never lands in your shell history.

## One-time setup

### 1. Create the Auth0 application (about five minutes)

Fastest path: run the setup script with a short-lived Management API token.
In the Auth0 dashboard open Applications, APIs, Auth0 Management API, API
Explorer tab, and copy the token shown there (it expires in 24 hours). The
tenant domain is the canonical one shown at the top of the dashboard, not the
custom domain.

```bash
cd tools/seymour-mcp
AUTH0_MGMT_TOKEN=<token> AUTH0_TENANT_DOMAIN=<tenant>.us.auth0.com \
  node scripts/create-auth0-app.mjs
```

It creates (or updates) a Native application named "Seymour MCP" with only the
Device Code and Refresh Token grants, rotating refresh tokens (30 days
absolute, 14 days idle), turns on Allow Offline Access for the API, and
prints the `export SEYMOUR_AUTH0_CLIENT_ID=...` line to use in step 2. It is
safe to re-run.

Manual path, in the Auth0 dashboard for the `auth.transparent.city` tenant:

1. Applications, Create Application, type **Native**, name it `Seymour MCP`.
2. Settings, Advanced Settings, Grant Types: enable **Device Code** and
   **Refresh Token**. Leave Authorization Code on; turn everything else off.
3. Settings, Refresh Token Rotation: enable **Rotation** and set an absolute
   lifetime you are comfortable with (30 days is a reasonable start).
4. Applications, APIs, open the Transparent City API
   (identifier `https://api.transparent.city/api`), Settings: make sure
   **Allow Offline Access** is on so refresh tokens are issued.
5. Copy the application's **Client ID**. It is public, not a secret.

Custom domains: Auth0 device flow works on the custom domain
`auth.transparent.city`, which is the default here. If your tenant's device
verification page only renders on the canonical `*.auth0.com` domain, set
`SEYMOUR_AUTH0_DOMAIN` to that instead.

### 2. Build and log in

```bash
cd tools/seymour-mcp
npm install
npm run build
export SEYMOUR_AUTH0_CLIENT_ID=<client id from step 1>
npm run login
```

The login command prints a URL and a short code. Open the URL, confirm the
code, sign in as you normally do, and the terminal reports who you are logged
in as. The refresh token keeps you logged in until it expires or is revoked.

### 3. Register the server with Claude Code

User scope makes it available in every project:

```bash
claude mcp add --scope user --transport stdio \
  --env SEYMOUR_AUTH0_CLIENT_ID=<client id> \
  seymour -- node /absolute/path/to/Ui/tools/seymour-mcp/dist/index.js
```

Then in any Claude Code session:

```
/mcp            # confirm "seymour" is connected
ask seymour which SF departments had the biggest overtime growth last year
```

### 4. Claude Desktop (optional)

Add the same server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "seymour": {
      "command": "node",
      "args": ["/absolute/path/to/Ui/tools/seymour-mcp/dist/index.js"],
      "env": { "SEYMOUR_AUTH0_CLIENT_ID": "<client id>" }
    }
  }
}
```

## Configuration

All settings are environment variables. Only the client id is required.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEYMOUR_AUTH0_CLIENT_ID` | (required) | Client ID of the Native app from step 1. |
| `SEYMOUR_AUTH0_DOMAIN` | `auth.transparent.city` | Auth0 tenant or custom domain. |
| `SEYMOUR_AUTH0_AUDIENCE` | `https://api.transparent.city/api` | API identifier the token is issued for. |
| `SEYMOUR_API_BASE` | `https://api.transparent.city` | Backend base URL. Point at `http://localhost:8001` for a local API. |
| `SEYMOUR_DEFAULT_MODEL` | `claude-sonnet-5.5` | Seymour model key for new sessions. |
| `SEYMOUR_DEFAULT_TOOL_GROUPS` | `core,research,web_search` | Comma-separated tool groups for new sessions. |
| `SEYMOUR_REQUEST_TIMEOUT_MS` | `300000` | How long to wait for one Seymour answer. |
| `SEYMOUR_MCP_TOKEN_PATH` | `~/.config/seymour-mcp/tokens.json` | Where tokens are stored. |

## Development

```bash
npm run type-check
npm test          # node:test, no network
npm run build
```

`src/seymour.ts` mirrors the request shapes in `src/lib/api/chat.ts` of the
web UI. If the chat API changes there, change it here too.

## Troubleshooting

- **"Not logged in to Seymour"**: run `npm run login` with the same
  `SEYMOUR_AUTH0_CLIENT_ID` the MCP server is started with.
- **`unauthorized_client` during login**: the client id is wrong, or the
  Device Code grant is not enabled on the Auth0 application.
- **401 from the API after login**: the audience does not match what the
  backend verifies. The default already appends `/api`; check
  `AUTH0_AUDIENCE` on the backend and set `SEYMOUR_AUTH0_AUDIENCE` to match.
- **No refresh token issued**: enable Allow Offline Access on the API and the
  Refresh Token grant on the application, then log in again.
- **Timeouts on long questions**: raise `SEYMOUR_REQUEST_TIMEOUT_MS`.
