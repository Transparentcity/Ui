# Environment Variables Setup

## Quick Reference

### Production (Vercel)

Set these in Vercel Dashboard → Project Settings → Environment Variables:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city
NEXT_PUBLIC_SITE_URL=https://app.transparent.city
```

### Local Development

Create `.env.local` in project root:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

## Variable Descriptions

### `NEXT_PUBLIC_API_BASE_URL`

- **Purpose**: Base URL for backend API calls
- **Format**: Full URL with protocol (http/https)
- **Examples**:
  - Production: `https://api.transparent.city`
  - Local: `http://localhost:8001`
- **Used in**: `src/lib/apiClient.ts`, `src/lib/publicApiClient.ts`

### `NEXT_PUBLIC_SITE_URL`

- **Purpose**: Canonical URL of the frontend application
- **Format**: Full URL with protocol (http/https)
- **Examples**:
  - Production: `https://app.transparent.city`
  - Local: `http://localhost:3001`
- **Used in**: `src/lib/siteUrl.ts`, SEO metadata, Auth0 callbacks

## Important Notes

1. **`NEXT_PUBLIC_` prefix**: Required for Next.js to expose variables to the browser
2. **No trailing slashes**: Don't include trailing `/` in URLs
3. **HTTPS in production**: Always use `https://` for production URLs
4. **Environment-specific**: Use different values for development vs production

## Verification

After setting environment variables:

1. **Vercel**: Redeploy to apply changes
2. **Local**: Restart dev server (`npm run dev`)
3. **Check**: Open browser console, verify API calls use correct base URL

