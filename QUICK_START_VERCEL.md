# Quick Start: Setting Up Vercel Project

## Important: Vercel Doesn't Use Static IPs

Vercel is a serverless platform with a global CDN. It doesn't provide static IP addresses. Instead:
- **Deployments get unique URLs** (e.g., `your-project.vercel.app`)
- **Custom domains use CNAME records** (not A records with IPs)
- **IPs are dynamic** and change per deployment/region

## Step 1: Create New Vercel Project

### Option A: Via Web Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/new
   - Or: https://vercel.com/dashboard → "Add New Project"

2. **Import Your Repository**
   - Click "Import Git Repository"
   - Select your `transparentcity-ui` repository
   - Authorize Vercel to access GitHub if prompted

3. **Configure Project**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (default - leave as is)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Add Environment Variables** (Before First Deploy)
   
   Click "Environment Variables" and add:
   
   | Variable | Value | Environments |
   |----------|-------|--------------|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://api.transparent.city` | Production, Preview, Development |
   | `NEXT_PUBLIC_SITE_URL` | `https://app.transparent.city` | Production, Preview, Development |

5. **Deploy**
   - Click "Deploy"
   - Wait 2-5 minutes for build
   - You'll get a URL like: `transparentcity-ui-abc123.vercel.app`

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# From your project directory
cd /Users/simongoldman/Documents/transparentcity-ui

# Deploy (first time will ask questions)
vercel

# Deploy to production
vercel --prod
```

## Step 2: Get Your Deployment URL

After deployment, you'll get:

1. **Production URL**: `https://your-project-name.vercel.app`
   - This is your main deployment URL
   - Find it in: Dashboard → Your Project → Deployments

2. **Preview URLs**: Unique URL for each branch/PR
   - Format: `https://your-project-git-branch-name.vercel.app`
   - Automatically created for each branch/PR

## Step 3: Configure Custom Domain (No IP Needed!)

Since Vercel doesn't use static IPs, you configure DNS with a **CNAME record**:

1. **Add Domain in Vercel**
   - Go to: Dashboard → Your Project → Settings → Domains
   - Click "Add Domain"
   - Enter: `app.transparent.city`
   - Click "Add"

2. **Vercel Will Show DNS Instructions**
   
   Vercel will display something like:
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
   
   **OR** it might show:
   ```
   Type: A
   Name: app
   Value: 76.76.21.21 (example - this is Vercel's IP pool)
   ```

3. **Add DNS Record in Your Domain Registrar**
   
   Go to your domain registrar (Google Domains, Namecheap, Cloudflare, etc.) and add the record Vercel provides.

4. **Wait for DNS Propagation**
   - Takes 5-60 minutes typically
   - Vercel will automatically provision SSL certificate
   - Check status in Vercel dashboard → Domains

## Step 4: Verify Setup

### Check Deployment Status

1. Go to Vercel Dashboard → Your Project → Deployments
2. Verify latest deployment shows "Ready" status
3. Click on deployment to see:
   - Build logs
   - Deployment URL
   - Build time
   - Environment variables used

### Test Your Deployment

```bash
# Test the deployment URL
curl -I https://your-project.vercel.app

# Or test custom domain (after DNS propagates)
curl -I https://app.transparent.city
```

## Understanding Vercel URLs

### Production Deployment
- **URL**: `https://your-project.vercel.app`
- **Updates**: When you push to `main` branch
- **Permanent**: This URL always points to latest production

### Preview Deployments
- **URL**: `https://your-project-git-branch-name.vercel.app`
- **Updates**: When you push to any branch
- **Temporary**: Each branch gets unique URL

### Custom Domain
- **URL**: `https://app.transparent.city`
- **Points to**: Latest production deployment
- **SSL**: Automatically provisioned by Vercel

## Finding Your Project Information

### In Vercel Dashboard

1. **Project URL**: 
   - Dashboard → Your Project → Overview
   - Shows: `https://your-project.vercel.app`

2. **Deployment URLs**:
   - Dashboard → Your Project → Deployments
   - Each deployment has its own URL

3. **Domain Configuration**:
   - Dashboard → Your Project → Settings → Domains
   - Shows all configured domains and DNS instructions

4. **Environment Variables**:
   - Dashboard → Your Project → Settings → Environment Variables
   - Shows all configured variables

### Via Vercel CLI

```bash
# List all projects
vercel ls

# Get project info
vercel inspect

# List deployments
vercel ls --prod
```

## Common Questions

### Q: Do I need an IP address?
**A**: No! Vercel uses CNAME records (or A records pointing to Vercel's IP pool). You don't manage IPs directly.

### Q: How do I find my deployment URL?
**A**: 
- Check Vercel Dashboard → Your Project → Deployments
- Or run `vercel ls` in CLI
- Or check the deployment notification email

### Q: Can I use a static IP?
**A**: No, Vercel doesn't provide static IPs. It's a serverless platform with dynamic IPs across a global CDN.

### Q: How do I point my domain to Vercel?
**A**: Use the DNS instructions Vercel provides when you add a custom domain. Usually a CNAME record pointing to `cname.vercel-dns.com`.

## Next Steps

After creating your Vercel project:

1. ✅ **Verify deployment works**: Visit your `.vercel.app` URL
2. ✅ **Configure environment variables**: Add API URLs
3. ✅ **Add custom domain**: Follow DNS instructions
4. ✅ **Test integration**: See `TESTING.md`
5. ✅ **Set up monitoring**: See `MONITORING.md`

## Quick Reference

| What You Need | Where to Find It |
|---------------|------------------|
| **Deployment URL** | Dashboard → Project → Deployments |
| **Custom Domain Setup** | Dashboard → Project → Settings → Domains |
| **Environment Variables** | Dashboard → Project → Settings → Environment Variables |
| **Build Logs** | Dashboard → Project → Deployments → Click deployment |
| **DNS Instructions** | Dashboard → Project → Settings → Domains → Add domain |

## Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Support**: https://vercel.com/support
- **Project Setup Guide**: See `VERCEL_SETUP.md` for detailed steps

