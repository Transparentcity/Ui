# Troubleshooting: Site Map "Couldn't load cities" Error

## Problem

The Site Map page shows "Couldn't load cities" and "fetch failed" in production, but works correctly in development.

## Root Causes

This error typically occurs due to one of these issues:

1. **Missing or incorrect `NEXT_PUBLIC_API_BASE_URL` environment variable**
2. **Backend API not accessible from production**
3. **CORS configuration issue**
4. **Network/firewall blocking the request**

## Diagnostic Steps

### Step 1: Verify Environment Variables in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify these variables are set:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://api.transparent.city`
   - `NEXT_PUBLIC_SITE_URL` = `https://app.transparent.city`
3. Ensure they're applied to **Production, Preview, and Development** environments
4. **Important**: After changing environment variables, you must redeploy

### Step 2: Test Backend API Directly

Test if the backend API endpoint is accessible:

```bash
# Test the sitemap endpoint directly
curl https://api.transparent.city/api/public/cities/sitemap

# Should return JSON array of cities
# If it fails, check backend logs and connectivity
```

### Step 3: Check Browser Console

1. Open the Site Map page in production
2. Open browser DevTools (F12) → Console tab
3. Look for error messages that show:
   - The API URL being called
   - The specific error (network, CORS, timeout, etc.)
4. Check Network tab to see the actual request:
   - URL should be: `https://api.transparent.city/api/public/cities/sitemap`
   - Status code (200 = success, 4xx/5xx = error)
   - Response headers (check for CORS headers)

### Step 4: Verify Backend CORS Configuration

Check that the backend allows requests from your frontend domain:

1. **Backend Environment Variable**:
   ```bash
   ALLOWED_ORIGINS=https://app.transparent.city,https://transparent.city,http://localhost:3001
   ```

2. **Verify in Backend Code** (`src/transparentcity/api/main.py`):
   ```python
   allowed_origins = [
       "https://app.transparent.city",
       "https://transparent.city",
       "http://localhost:3001"  # for local dev
   ]
   ```

3. **Test CORS**:
   ```bash
   curl -H "Origin: https://app.transparent.city" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        https://api.transparent.city/api/public/cities/sitemap \
        -v
   ```
   
   Should return `Access-Control-Allow-Origin: https://app.transparent.city`

### Step 5: Check Backend Logs

On the backend server, check logs for:
- Database connection errors
- Request failures
- CORS rejections

```bash
# On GCP VM
tail -f /var/log/transparentcity/application.log
# or wherever your logs are stored
```

## Common Solutions

### Solution 1: Environment Variable Not Set

**Symptom**: Error shows `http://localhost:8001` in the error message

**Fix**:
1. Set `NEXT_PUBLIC_API_BASE_URL` in Vercel
2. Redeploy the application

### Solution 2: Backend Not Accessible

**Symptom**: Network error, connection refused, or timeout

**Fix**:
1. Verify backend is running: `curl https://api.transparent.city/health`
2. Check firewall rules allow traffic
3. Verify DNS resolution: `nslookup api.transparent.city`
4. Check SSL certificate is valid

### Solution 3: CORS Error

**Symptom**: Browser console shows CORS error

**Fix**:
1. Update backend `ALLOWED_ORIGINS` environment variable
2. Restart backend server
3. Verify CORS middleware is configured correctly

### Solution 4: Database Connection Issue

**Symptom**: Backend returns 503 or 500 error

**Fix**:
1. Check database is running and accessible
2. Verify database connection string in backend `.env`
3. Check database logs for connection errors

## Verification

After applying fixes:

1. **Redeploy frontend** (if environment variables changed)
2. **Restart backend** (if CORS or database config changed)
3. **Clear browser cache** and reload the Site Map page
4. **Check browser console** for any remaining errors
5. **Verify API call succeeds** in Network tab

## Error Messages Reference

### "Failed to connect to API at..."
- **Cause**: Backend API is unreachable
- **Fix**: Check backend is running and accessible

### "API GET /api/public/cities/sitemap failed: 503"
- **Cause**: Backend service unavailable (often database connection)
- **Fix**: Check backend logs and database connectivity

### "API GET /api/public/cities/sitemap failed: 500"
- **Cause**: Backend internal error
- **Fix**: Check backend logs for error details

### CORS error in browser console
- **Cause**: Backend not allowing requests from frontend origin
- **Fix**: Update `ALLOWED_ORIGINS` in backend configuration

## Still Having Issues?

1. Check Vercel deployment logs for build-time errors
2. Check backend application logs for runtime errors
3. Verify all environment variables are set correctly
4. Test API endpoint directly with `curl` or Postman
5. Compare working dev environment with production configuration

