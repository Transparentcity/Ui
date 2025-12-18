# TransparentCity UI Deployment Guide

## Overview

This guide covers deploying the Next.js frontend to Vercel with the backend API on GCP.

**Architecture:**
- **Frontend**: `app.transparent.city` (Vercel)
- **Backend**: `api.transparent.city` (GCP Compute Engine)

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub repository for transparentcity-ui
- DNS access to configure subdomains
- Backend API already deployed and accessible

## Quick Start Checklist

- [ ] DNS configured (see `DNS_SETUP.md`)
- [ ] Vercel account created
- [ ] GitHub repo accessible
- [ ] Backend API deployed and accessible
- [ ] Environment variables ready

## Step 1: Environment Variables

### For Vercel Deployment

Set these environment variables in the Vercel dashboard (Project Settings → Environment Variables):

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city
NEXT_PUBLIC_SITE_URL=https://app.transparent.city
```

### For Local Development

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

## Step 2: Vercel Setup

> **Note**: Complete DNS setup first (see `DNS_SETUP.md`) before adding custom domain in Vercel.

### 2.1 Connect Repository

1. Go to https://vercel.com/new
2. Import your `transparentcity-ui` GitHub repository
3. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (root of repo)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

### 2.2 Configure Environment Variables

1. Go to Project Settings → Environment Variables
2. Add the following:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://api.transparent.city`
   - `NEXT_PUBLIC_SITE_URL` = `https://app.transparent.city`
3. Apply to: **Production, Preview, Development**

### 2.3 Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Note the deployment URL (e.g., `transparentcity-ui.vercel.app`)

## Step 3: DNS Configuration

### 3.1 Add Custom Domain

1. In Vercel dashboard: Settings → Domains
2. Add domain: `app.transparent.city`
3. Follow DNS configuration instructions

### 3.2 DNS Records

Add these DNS records in your domain registrar:

```
Type    Name    Value
----    ----    -----
CNAME   app     cname.vercel-dns.com
A       api     <GCP_VM_IP_ADDRESS>
```

Or if using a DNS provider that supports ALIAS/ANAME:

```
Type    Name    Value
----    ----    -----
ALIAS   app     <vercel-provided-alias>
A       api     <GCP_VM_IP_ADDRESS>
```

### 3.3 SSL Certificates

- **Vercel**: Automatic SSL via Let's Encrypt (no action needed)
- **GCP Backend**: Already configured via certbot

## Step 4: Verify Deployment

### 4.1 Test Frontend

1. Visit `https://app.transparent.city`
2. Verify page loads correctly
3. Check browser console for errors

### 4.2 Test API Connection

1. Open browser DevTools → Network tab
2. Navigate through the app
3. Verify API calls go to `https://api.transparent.city`
4. Check for CORS errors (should be none)

### 4.3 Test Authentication

1. Try logging in via Auth0
2. Verify callback URL works: `https://app.transparent.city/callback`
3. Check that authenticated requests include proper headers

## Step 5: Backend Configuration

Ensure backend is configured correctly:

### 5.1 CORS Configuration

The backend should have these environment variables set:

```bash
ALLOWED_ORIGINS=https://app.transparent.city,https://transparent.city,http://localhost:3001
BASE_URL=https://api.transparent.city
```

### 5.2 Auth0 Configuration

Update Auth0 settings:

- **Allowed Callback URLs**: `https://app.transparent.city/callback`
- **Allowed Logout URLs**: `https://app.transparent.city`
- **Allowed Web Origins**: `https://app.transparent.city`

## Troubleshooting

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Solution**:
1. Verify `ALLOWED_ORIGINS` in backend includes `https://app.transparent.city`
2. Check backend logs for CORS middleware configuration
3. Ensure `allow_credentials=True` in CORS middleware

### API Connection Failed

**Symptom**: Frontend can't connect to backend API

**Solution**:
1. Verify `NEXT_PUBLIC_API_BASE_URL` is set correctly in Vercel
2. Test backend directly: `curl https://api.transparent.city/health`
3. Check backend firewall rules allow traffic
4. Verify DNS resolution: `nslookup api.transparent.city`

### Authentication Issues

**Symptom**: Auth0 login fails or redirects incorrectly

**Solution**:
1. Verify Auth0 callback URL matches: `https://app.transparent.city/callback`
2. Check Auth0 application settings
3. Verify `NEXT_PUBLIC_SITE_URL` is set correctly
4. Clear browser cookies and try again

### Build Failures

**Symptom**: Vercel build fails

**Solution**:
1. Check build logs in Vercel dashboard
2. Verify all dependencies are in `package.json`
3. Ensure Node.js version is compatible (check `package.json` engines)
4. Test build locally: `npm run build`

## Continuous Deployment

Vercel automatically deploys on:
- Push to `main` branch → Production
- Push to other branches → Preview deployment
- Pull requests → Preview deployment with unique URL

## Monitoring

### Vercel Analytics

1. Enable Analytics in Vercel dashboard
2. Monitor:
   - Page views
   - Performance metrics
   - Error rates
   - User sessions

### Error Tracking

Consider adding:
- Sentry for error tracking
- LogRocket for session replay
- Vercel Analytics for performance

## Rollback

If deployment has issues:

1. Go to Vercel dashboard → Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

## Cost Estimates

### Vercel Pricing

- **Hobby (Free)**: 100GB bandwidth/month
- **Pro ($20/month)**: Unlimited bandwidth, team features
- **Enterprise**: Custom pricing

For most projects, Pro plan is recommended.

## Next Steps

- [ ] Set up monitoring and error tracking
- [ ] Configure custom domain
- [ ] Set up staging environment
- [ ] Configure preview deployments for PRs
- [ ] Set up analytics

## Support

For issues:
1. Check Vercel documentation: https://vercel.com/docs
2. Check Next.js documentation: https://nextjs.org/docs
3. Review backend logs on GCP VM

