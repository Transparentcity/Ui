# Testing Production API from Local Development

This guide shows how to test the production API (`api.transparent.city`) from your local development environment.

## Quick Setup

The `.env.local` file has been created and configured to point to the production API:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

## Testing Steps

### 1. Start the Development Server

```bash
cd transparentcity-ui
npm run dev
```

The server will start on `http://localhost:3001`

### 2. Verify API Connection

Open your browser and navigate to:
- **Site Map**: http://localhost:3001/sitemap
- **Home**: http://localhost:3001

### 3. Check Browser Console

Open DevTools (F12) → Console tab and look for:
- API calls going to `https://api.transparent.city`
- Any CORS errors (shouldn't have any if backend is configured correctly)
- Network tab showing successful requests to the production API

### 4. Test Specific Endpoints

You can test the API directly:

```bash
# Test health endpoint
curl https://api.transparent.city/health

# Test sitemap endpoint
curl https://api.transparent.city/api/public/cities/sitemap
```

## Switching Back to Local Backend

If you want to switch back to using your local backend:

1. Edit `.env.local`:
   ```bash
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
   ```

2. Restart the dev server:
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console, the backend needs to allow requests from `http://localhost:3001`. 

Check the backend's `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://app.transparent.city,https://transparent.city,http://localhost:3001
```

### Connection Refused

If you see "connection refused" errors:
1. Verify the production API is accessible: `curl https://api.transparent.city/health`
2. Check if there are firewall issues
3. Verify DNS resolution: `nslookup api.transparent.city`

### API Not Responding

If the API returns errors:
1. Check backend logs on the GCP VM
2. Verify the backend service is running
3. Check if the endpoint exists: `curl https://api.transparent.city/api/public/cities/sitemap`

## Environment File Priority

Next.js loads environment variables in this order (highest priority first):
1. `.env.local` (local overrides, not committed to git)
2. `.env.development` or `.env.production` (environment-specific)
3. `.env` (default, can be committed)

The `.env.local` file takes precedence, so it will override any other settings.

## Notes

- The `.env.local` file is in `.gitignore` and won't be committed
- Changes to `.env.local` require restarting the dev server
- This setup is only for testing - production deployments use Vercel environment variables

