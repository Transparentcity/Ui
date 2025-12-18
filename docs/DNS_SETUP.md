# DNS Configuration Guide

## Overview

This guide covers DNS setup for the TransparentCity subdomain architecture:
- **Frontend**: `app.transparent.city` → Vercel
- **Backend**: `api.transparent.city` → GCP VM

## Step 1: Get Vercel DNS Target

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add domain: `app.transparent.city`
3. Vercel will provide DNS configuration instructions
4. Note the DNS target (usually `cname.vercel-dns.com` or similar)

## Step 2: Get GCP VM IP Address

```bash
# From your local machine
gcloud compute instances describe transparentcity-prod \
    --zone=us-central1-a \
    --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

Or check in GCP Console:
1. Go to Compute Engine → VM instances
2. Find your VM instance
3. Note the External IP address

## Step 3: Configure DNS Records

### Option A: Using Your Domain Registrar

Log into your domain registrar (e.g., Google Domains, Namecheap, Cloudflare) and add:

#### For Frontend (Vercel)

**Type**: `CNAME`  
**Name**: `app`  
**Value**: `cname.vercel-dns.com` (or value provided by Vercel)  
**TTL**: `3600` (or default)

**OR** if your DNS provider supports ALIAS/ANAME:

**Type**: `ALIAS` or `ANAME`  
**Name**: `app`  
**Value**: `<vercel-provided-alias>`  
**TTL**: `3600`

#### For Backend (GCP VM)

**Type**: `A`  
**Name**: `api`  
**Value**: `<GCP_VM_IP_ADDRESS>`  
**TTL**: `3600`

### Option B: Using Cloudflare DNS

If using Cloudflare:

1. Go to Cloudflare Dashboard → Your Domain → DNS
2. Add records:

```
Type: CNAME
Name: app
Target: cname.vercel-dns.com
Proxy: Off (gray cloud)
TTL: Auto

Type: A
Name: api
IPv4 address: <GCP_VM_IP_ADDRESS>
Proxy: Off (gray cloud) - Important: Backend needs direct connection
TTL: Auto
```

**Important**: Keep the `api` record with Proxy **OFF** (gray cloud) because:
- WebSocket connections need direct IP access
- Backend handles its own SSL certificates
- Proxy can interfere with WebSocket upgrades

## Step 4: Verify DNS Propagation

### Check Frontend DNS

```bash
# Should resolve to Vercel IPs
dig app.transparent.city +short
nslookup app.transparent.city
```

### Check Backend DNS

```bash
# Should resolve to your GCP VM IP
dig api.transparent.city +short
nslookup api.transparent.city
```

### Online Tools

- https://dnschecker.org - Check global DNS propagation
- https://www.whatsmydns.net - DNS lookup tool

## Step 5: SSL Certificate Setup

### Frontend (Vercel)

- **Automatic**: Vercel handles SSL certificates via Let's Encrypt
- **No action needed**: SSL is provisioned automatically when domain is added
- **Verification**: Takes 5-60 minutes after DNS propagation

### Backend (GCP VM)

If not already configured:

```bash
# SSH into VM
gcloud compute ssh transparentcity-prod --zone=us-central1-a

# Install certbot if not installed
sudo apt install certbot python3-certbot-nginx

# Get certificate for api subdomain
sudo certbot --nginx -d api.transparent.city

# Auto-renewal is configured automatically
```

## Step 6: Test Configuration

### Test Frontend

```bash
# Should return 200 or 301/302 redirect
curl -I https://app.transparent.city

# Check SSL certificate
openssl s_client -connect app.transparent.city:443 -servername app.transparent.city
```

### Test Backend

```bash
# Should return health check response
curl https://api.transparent.city/health

# Check SSL certificate
openssl s_client -connect api.transparent.city:443 -servername api.transparent.city
```

## Troubleshooting

### DNS Not Propagating

**Symptom**: DNS lookup returns old IP or fails

**Solutions**:
1. Wait 24-48 hours for full global propagation
2. Clear local DNS cache:
   ```bash
   # macOS
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   
   # Linux
   sudo systemd-resolve --flush-caches
   
   # Windows
   ipconfig /flushdns
   ```
3. Use different DNS servers (8.8.8.8, 1.1.1.1)
4. Check TTL values - lower TTL = faster updates

### SSL Certificate Issues

**Frontend (Vercel)**:
- Wait 5-60 minutes after DNS propagation
- Check Vercel dashboard → Domains for certificate status
- Verify DNS is correctly configured

**Backend (GCP)**:
- Ensure port 80 is open for Let's Encrypt validation
- Check Nginx configuration includes SSL settings
- Verify certbot certificate is valid: `sudo certbot certificates`

### CORS Errors After DNS Setup

If you see CORS errors:
1. Verify `ALLOWED_ORIGINS` in backend includes `https://app.transparent.city`
2. Restart backend service after updating environment variables
3. Check browser console for exact CORS error message

## DNS Record Summary

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| CNAME | app | cname.vercel-dns.com | Frontend (Vercel) |
| A | api | `<GCP_VM_IP>` | Backend (GCP VM) |

## Next Steps

After DNS is configured:
1. [ ] Verify DNS propagation (24-48 hours)
2. [ ] Verify SSL certificates are active
3. [ ] Test frontend loads at `https://app.transparent.city`
4. [ ] Test backend API at `https://api.transparent.city/health`
5. [ ] Proceed with Vercel deployment setup

