# Vercel Deployment Setup Guide

## Prerequisites

Before starting, ensure you have:
- [ ] DNS configured (see `DNS_SETUP.md`)
- [ ] GitHub repository with transparentcity-ui code
- [ ] Vercel account (sign up at https://vercel.com)
- [ ] Backend API accessible at `https://api.transparent.city`

## Step-by-Step Setup

### Step 1: Run Setup Check

```bash
# From transparentcity-ui directory
./scripts/vercel-setup.sh app.transparent.city
```

This verifies:
- Node.js and npm are installed
- Dependencies are installed
- Configuration files exist
- Build succeeds
- DNS is configured (if domain provided)

### Step 2: Connect Repository to Vercel

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/new
   - Or click "Add New Project" in your dashboard

2. **Import Repository**
   - Select "Import Git Repository"
   - Choose your `transparentcity-ui` repository
   - Authorize Vercel to access your GitHub account if needed

3. **Configure Project**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Environment Variables**
   Before deploying, add these environment variables:
   
   Click "Environment Variables" and add:
   
   | Variable | Value | Environment |
   |----------|-------|-------------|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://api.transparent.city` | Production, Preview, Development |
   | `NEXT_PUBLIC_SITE_URL` | `https://app.transparent.city` | Production, Preview, Development |

   **Important**: 
   - Apply to all environments (Production, Preview, Development)
   - Use `https://` for production URLs
   - No trailing slashes

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (2-5 minutes)
   - Note the deployment URL (e.g., `transparentcity-ui-abc123.vercel.app`)

### Step 3: Add Custom Domain

1. **Go to Project Settings**
   - In Vercel dashboard, open your project
   - Go to Settings → Domains

2. **Add Domain**
   - Enter: `app.transparent.city`
   - Click "Add"

3. **Configure DNS**
   - Vercel will show DNS configuration instructions
   - Follow the instructions to add CNAME record in your DNS provider
   - See `DNS_SETUP.md` for detailed DNS instructions

4. **Wait for SSL**
   - Vercel automatically provisions SSL certificate
   - Takes 5-60 minutes after DNS propagation
   - Check status in Vercel dashboard → Domains

### Step 4: Verify Deployment

1. **Check Deployment Status**
   - Go to Deployments tab
   - Verify latest deployment shows "Ready" status
   - Check build logs for any warnings

2. **Test Frontend**
   ```bash
   # Should return 200 OK
   curl -I https://app.transparent.city
   
   # Or open in browser
   open https://app.transparent.city
   ```

3. **Test API Connection**
   - Open browser DevTools → Network tab
   - Navigate through the app
   - Verify API calls go to `https://api.transparent.city`
   - Check for CORS errors (should be none)

4. **Test Authentication**
   - Try logging in via Auth0
   - Verify callback URL works
   - Check authenticated requests work

## Environment-Specific Configuration

### Production Environment

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city
NEXT_PUBLIC_SITE_URL=https://app.transparent.city
```

### Preview Environments (PRs and branches)

Vercel automatically creates preview deployments. You can use the same production URLs or create staging backend:

```bash
# Option 1: Use production API (simpler)
NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city
NEXT_PUBLIC_SITE_URL=https://app.transparent.city

# Option 2: Use staging API (if you have one)
NEXT_PUBLIC_API_BASE_URL=https://api-staging.transparent.city
NEXT_PUBLIC_SITE_URL=${VERCEL_URL}  # Auto-set by Vercel
```

### Development Environment

For local development, create `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

## Continuous Deployment

Vercel automatically deploys:

- **Push to `main` branch** → Production deployment
- **Push to other branches** → Preview deployment with unique URL
- **Pull requests** → Preview deployment with comment link

### Deployment Workflow

1. **Make changes** in your local branch
2. **Commit and push** to GitHub
3. **Vercel automatically**:
   - Detects the push
   - Runs build
   - Creates deployment
   - Updates preview/production URL

### Manual Deployment

If needed, you can trigger manual deployment:

1. Go to Vercel dashboard → Deployments
2. Click "Redeploy" on any previous deployment
3. Or use Vercel CLI: `vercel --prod`

## Rollback

If a deployment has issues:

1. **Go to Deployments tab**
2. **Find previous successful deployment**
3. **Click "..." menu → "Promote to Production"**

This instantly rolls back to the previous version.

## Monitoring

### Vercel Analytics

1. **Enable Analytics**
   - Go to Project Settings → Analytics
   - Enable "Web Analytics"
   - Free tier includes basic analytics

2. **View Metrics**
   - Go to Analytics tab
   - Monitor:
     - Page views
     - Performance metrics
     - Web Vitals
     - User sessions

### Error Tracking

Consider adding:
- **Sentry**: Error tracking and performance monitoring
- **LogRocket**: Session replay and error tracking
- **Vercel Speed Insights**: Performance monitoring

## Troubleshooting

### Build Failures

**Symptom**: Deployment fails during build

**Solutions**:
1. Check build logs in Vercel dashboard
2. Test build locally: `npm run build`
3. Verify all dependencies in `package.json`
4. Check Node.js version compatibility
5. Ensure environment variables are set

### Environment Variables Not Working

**Symptom**: Frontend can't connect to backend

**Solutions**:
1. Verify variables are set in Vercel dashboard
2. Check variable names (must start with `NEXT_PUBLIC_`)
3. Redeploy after adding variables
4. Check browser console for actual API URL being used

### DNS/SSL Issues

**Symptom**: Domain not working or SSL errors

**Solutions**:
1. Verify DNS is correctly configured (see `DNS_SETUP.md`)
2. Wait 5-60 minutes for SSL certificate provisioning
3. Check Vercel dashboard → Domains for certificate status
4. Ensure DNS has propagated globally

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Solutions**:
1. Verify backend `ALLOWED_ORIGINS` includes `https://app.transparent.city`
2. Restart backend service after updating CORS
3. Check backend logs for CORS middleware configuration
4. Verify `allow_credentials=True` in backend CORS config

## Vercel CLI (Optional)

For advanced usage, install Vercel CLI:

```bash
npm install -g vercel

# Login
vercel login

# Deploy from project directory
vercel

# Deploy to production
vercel --prod

# View deployments
vercel ls
```

## Cost Information

### Vercel Pricing Tiers

- **Hobby (Free)**:
  - 100GB bandwidth/month
  - Unlimited requests
  - Good for small projects

- **Pro ($20/month)**:
  - Unlimited bandwidth
  - Team collaboration
  - Advanced analytics
  - Recommended for production

- **Enterprise**:
  - Custom pricing
  - Dedicated support
  - Advanced features

## Next Steps

After successful deployment:

1. [ ] Set up monitoring and error tracking
2. [ ] Configure preview deployments for PRs
3. [ ] Set up staging environment (optional)
4. [ ] Configure custom error pages
5. [ ] Set up analytics
6. [ ] Test authentication flow end-to-end
7. [ ] Verify WebSocket connections work
8. [ ] Set up performance monitoring

## Support Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Next.js Documentation**: https://nextjs.org/docs
- **Vercel Community**: https://github.com/vercel/vercel/discussions
- **Project Deployment Guide**: See `DEPLOYMENT.md`

