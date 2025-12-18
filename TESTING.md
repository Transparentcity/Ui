# Integration Testing Guide

## Overview

This guide covers testing the frontend-backend integration after deployment to ensure everything works correctly with the subdomain architecture.

## Pre-Testing Checklist

Before running tests, verify:
- [ ] Frontend deployed at `https://app.transparent.city`
- [ ] Backend accessible at `https://api.transparent.city`
- [ ] DNS configured and propagated
- [ ] SSL certificates active
- [ ] Environment variables set correctly

## Test 1: Basic Connectivity

### Frontend Accessibility

```bash
# Test frontend loads
curl -I https://app.transparent.city

# Expected: HTTP 200 or 301/302
# Check for proper SSL certificate
openssl s_client -connect app.transparent.city:443 -servername app.transparent.city
```

**Browser Test**:
1. Open `https://app.transparent.city` in browser
2. Verify page loads without errors
3. Check browser console (F12) for JavaScript errors
4. Verify no CORS errors in console

### Backend API Accessibility

```bash
# Test backend health endpoint
curl https://api.transparent.city/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   ...
# }
```

**Browser Test**:
1. Open `https://api.transparent.city/health` in browser
2. Verify JSON response displays correctly
3. Check SSL certificate is valid

## Test 2: API Integration

### Test API Calls from Frontend

1. **Open Browser DevTools**
   - Press F12 or right-click → Inspect
   - Go to Network tab
   - Filter by "Fetch/XHR"

2. **Navigate Through App**
   - Load different pages
   - Trigger API calls (login, data fetching, etc.)

3. **Verify API Requests**
   - Check that requests go to `https://api.transparent.city`
   - Verify requests include proper headers:
     - `Authorization: Bearer <token>` (for authenticated requests)
     - `Content-Type: application/json`
     - `Accept: application/json`

4. **Check Responses**
   - Verify responses are successful (200 status)
   - Check response data is correct
   - Verify no CORS errors

### Test with curl

```bash
# Test public endpoint
curl https://api.transparent.city/health

# Test with authentication (replace TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.transparent.city/api/cities/saved
```

## Test 3: CORS Configuration

### Verify CORS Headers

```bash
# Test CORS preflight
curl -X OPTIONS https://api.transparent.city/api/cities/saved \
     -H "Origin: https://app.transparent.city" \
     -H "Access-Control-Request-Method: GET" \
     -v

# Expected headers in response:
# Access-Control-Allow-Origin: https://app.transparent.city
# Access-Control-Allow-Credentials: true
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

### Browser CORS Test

1. **Open Browser Console**
2. **Run JavaScript**:
   ```javascript
   fetch('https://api.transparent.city/health', {
     method: 'GET',
     credentials: 'include',
     headers: {
       'Accept': 'application/json'
     }
   })
   .then(r => r.json())
   .then(data => console.log('Success:', data))
   .catch(err => console.error('CORS Error:', err));
   ```

3. **Expected**: No CORS errors, successful response

## Test 4: WebSocket Connections

### Test Job WebSocket

1. **Open Browser Console**
2. **Check WebSocket Connection**:
   - Look for log messages: "🔌 Connecting to job WebSocket"
   - Should connect to: `wss://api.transparent.city/api/jobs/ws`
   - Verify connection status: "✅ Job WebSocket connected"

3. **Test WebSocket Functionality**:
   - Create a job (e.g., refresh city data)
   - Verify WebSocket receives job updates
   - Check job status updates in real-time

### Test WebSocket with curl (if supported)

```bash
# Note: WebSocket testing typically requires browser or specialized tools
# Use browser DevTools → Network → WS filter to monitor WebSocket traffic
```

### Browser DevTools WebSocket Test

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Trigger a job creation
4. Verify:
   - WebSocket connection established
   - Messages received from backend
   - Connection remains stable

## Test 5: Authentication Flow

### Test Auth0 Login

1. **Navigate to Login**
   - Go to `https://app.transparent.city`
   - Click login/signup button

2. **Verify Redirect**
   - Should redirect to Auth0 login page
   - URL should include correct callback URL

3. **Complete Login**
   - Enter credentials
   - Complete authentication

4. **Verify Callback**
   - Should redirect back to `https://app.transparent.city/callback`
   - Should then redirect to main app
   - User should be authenticated

### Test Authenticated API Calls

1. **After Login**
   - Open DevTools → Network tab
   - Navigate through authenticated pages

2. **Verify Requests**
   - Check requests include `Authorization: Bearer <token>` header
   - Verify tokens are valid (not expired)
   - Check responses are successful

3. **Test Protected Endpoints**
   - Try accessing admin features (if admin user)
   - Verify permissions work correctly

### Test Token Refresh

1. **Wait for Token Expiry** (or manually expire)
2. **Trigger API Call**
3. **Verify**:
   - Token is automatically refreshed
   - Request succeeds after refresh
   - No authentication errors

## Test 6: Error Handling

### Test API Error Responses

1. **Trigger Error Condition**
   - Invalid API request
   - Missing authentication
   - Invalid data

2. **Verify Error Handling**
   - Error messages display correctly
   - No unhandled exceptions
   - User-friendly error messages

### Test Network Errors

1. **Simulate Network Failure**
   - Disable network in DevTools
   - Trigger API call

2. **Verify**:
   - Error handling works
   - User sees appropriate error message
   - App doesn't crash

## Test 7: Performance

### Test Page Load Times

1. **Open DevTools → Network tab**
2. **Reload Page**
3. **Check**:
   - Initial page load time
   - Time to first byte (TTFB)
   - Total page load time

### Test API Response Times

1. **Monitor API Calls**
   - Check response times in Network tab
   - Verify reasonable performance (< 1s for most requests)

2. **Test Concurrent Requests**
   - Trigger multiple API calls simultaneously
   - Verify all complete successfully
   - Check for race conditions

## Test 8: Cross-Browser Testing

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

Verify:
- [ ] Authentication works
- [ ] API calls succeed
- [ ] WebSocket connections work
- [ ] No browser-specific errors

## Test 9: Production vs Development

### Compare Environments

1. **Test Production** (`https://app.transparent.city`)
2. **Test Local Development** (`http://localhost:3001`)
3. **Verify**:
   - Both connect to correct backend URLs
   - Environment variables work correctly
   - No hardcoded URLs

## Automated Testing Script

Create a simple test script:

```bash
#!/bin/bash
# integration-test.sh

FRONTEND_URL="https://app.transparent.city"
BACKEND_URL="https://api.transparent.city"

echo "Testing Frontend..."
curl -I "$FRONTEND_URL" | head -1

echo "Testing Backend Health..."
curl "$BACKEND_URL/health" | jq .

echo "Testing CORS..."
curl -X OPTIONS "$BACKEND_URL/health" \
     -H "Origin: $FRONTEND_URL" \
     -H "Access-Control-Request-Method: GET" \
     -v 2>&1 | grep -i "access-control"

echo "Tests complete!"
```

## Common Issues and Solutions

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Solution**:
1. Verify `ALLOWED_ORIGINS` in backend includes `https://app.transparent.city`
2. Restart backend service
3. Clear browser cache
4. Check backend logs for CORS middleware

### WebSocket Connection Failed

**Symptom**: WebSocket doesn't connect

**Solution**:
1. Verify WebSocket URL is correct: `wss://api.transparent.city/api/jobs/ws`
2. Check backend WebSocket endpoint is accessible
3. Verify Nginx configuration allows WebSocket upgrades
4. Check firewall rules allow WebSocket connections

### Authentication Redirect Loop

**Symptom**: Infinite redirect between app and Auth0

**Solution**:
1. Verify Auth0 callback URL: `https://app.transparent.city/callback`
2. Check `NEXT_PUBLIC_SITE_URL` is set correctly
3. Clear browser cookies
4. Verify Auth0 application settings

### API Calls Fail

**Symptom**: All API calls return errors

**Solution**:
1. Verify `NEXT_PUBLIC_API_BASE_URL` is set correctly
2. Check backend is accessible: `curl https://api.transparent.city/health`
3. Verify CORS configuration
4. Check browser console for specific error messages

## Test Checklist

After deployment, verify:

- [ ] Frontend loads at `https://app.transparent.city`
- [ ] Backend accessible at `https://api.transparent.city/health`
- [ ] API calls from frontend succeed
- [ ] CORS headers are correct
- [ ] WebSocket connections work
- [ ] Authentication flow works
- [ ] Token refresh works
- [ ] Error handling works
- [ ] Performance is acceptable
- [ ] Works in multiple browsers
- [ ] Mobile browsers work

## Next Steps

After successful testing:
1. [ ] Set up monitoring (see `MONITORING.md`)
2. [ ] Configure error tracking
3. [ ] Set up performance monitoring
4. [ ] Document any issues found
5. [ ] Create runbook for common issues

