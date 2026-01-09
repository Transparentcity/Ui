# Fixing Auth0 Logo Issue

## Problem

You're seeing the wrong logo graphic when logging in through Auth0, even though the Client ID and Domain look correct.

## Root Cause

The logo displayed during Auth0 login is controlled by **Auth0 Dashboard branding settings**, not by your application code. The logo is configured at the Auth0 tenant or application level.

## Quick Fix Steps

### Step 1: Verify Your Auth0 Application

1. **Run the verification script:**
   ```bash
   npm run verify-auth0
   ```

2. **Check your Auth0 Dashboard:**
   - Go to https://manage.auth0.com/dashboard/
   - Navigate to **Applications** → Select your application
   - Verify the **Client ID** matches your `NEXT_PUBLIC_AUTH0_CLIENT_ID`
   - Verify the **Domain** matches your `NEXT_PUBLIC_AUTH0_DOMAIN`

### Step 2: Update Logo in Auth0 Dashboard

#### Option A: Update Logo via Branding Settings (Recommended)

1. In Auth0 Dashboard, go to **Branding** → **Universal Login** → **Login**
2. Scroll to the **"Logo"** section
3. Either:
   - **Upload a logo file** (PNG, SVG, or JPG)
   - **Set a logo URL** to: `https://app.transparent.city/images/logo-combined.png`
4. Click **Save Changes**

#### Option B: Use Custom Login Page

1. Go to **Branding** → **Universal Login** → **Login**
2. Enable **"Customize Login Page"**
3. In the HTML template, add your logo:
   ```html
   <img src="https://app.transparent.city/images/logo-combined.png" 
        alt="TransparentCity" 
        style="max-width: 200px; margin-bottom: 20px;" />
   ```
4. Click **Save Changes**

### Step 3: Generate Logo Assets (If Needed)

If you need to generate the logo assets:

```bash
npm run generate-auth0-assets
```

This creates:
- `public/images/logo.png` - Logo only
- `public/images/logo-text.png` - Text only  
- `public/images/logo-combined.png` - Logo + Text (Recommended)

### Step 4: Verify Changes

1. **Clear browser cache** (or use incognito mode)
2. **Log out** of your application
3. **Log back in** and verify the correct logo appears

## Troubleshooting

### Still Seeing Wrong Logo?

1. **Check for Multiple Auth0 Applications:**
   - You might have multiple applications in your Auth0 tenant
   - Verify you're editing the correct application that matches your Client ID

2. **Check Tenant-Level Branding:**
   - Go to **Branding** → **Universal Login** → **Login**
   - Check if there's a tenant-level logo that overrides application-level settings
   - Some Auth0 plans have tenant-level branding that affects all applications

3. **Verify Client ID is Correct:**
   - Check your `.env.local` file
   - Compare with the Client ID in Auth0 Dashboard
   - Make sure you're not using a different environment's Client ID

4. **Check Custom Domain Settings:**
   - If you're using a custom Auth0 domain, check its branding settings separately
   - Custom domains can have their own logo configuration

5. **Clear Auth0 Cache:**
   - Auth0 caches branding assets
   - Changes may take a few minutes to propagate
   - Try logging in from an incognito window

### Logo Not Loading from URL?

If you're using a logo URL and it's not loading:

1. **Verify the URL is publicly accessible:**
   ```bash
   curl -I https://app.transparent.city/images/logo-combined.png
   ```
   Should return `200 OK`

2. **Check CORS settings:**
   - Auth0 needs to be able to fetch the image
   - Make sure your server allows cross-origin requests for images

3. **Use a CDN or direct image hosting:**
   - Consider uploading the logo to a CDN
   - Or use Auth0's built-in logo upload feature

## Environment Variables Reference

Make sure these are set in `.env.local`:

```bash
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.transparentcity.app
```

## Related Files

- `src/app/providers.tsx` - Auth0 provider configuration
- `scripts/verify-auth0-config.js` - Configuration verification script
- `scripts/generate-auth0-assets.js` - Logo asset generation
- `public/images/logo-combined.png` - Recommended logo for Auth0

## Additional Resources

- [Auth0 Branding Documentation](https://auth0.com/docs/customize/universal-login-pages/branding)
- [Auth0 Universal Login Customization](https://auth0.com/docs/customize/universal-login-pages)
- [TransparentCity Brand Kit](../docs/BRAND_KIT.md)

