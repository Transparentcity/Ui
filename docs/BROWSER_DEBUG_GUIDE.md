# Browser Debugging Guide for Authentication Issues

## Quick Debugging from Browser Console

Open your browser's Developer Console (F12 or Cmd+Option+I) and paste these scripts to debug authentication issues.

### 1. Get Your Auth Token

```javascript
// Get Auth0 token (requires Auth0 React SDK to be loaded)
(async () => {
  try {
    // Access Auth0 from window if available
    const auth0 = window.__AUTH0_REACT__;
    if (!auth0) {
      console.error('Auth0 not found. Make sure you are logged in.');
      return null;
    }
    
    // Try to get token from Auth0 context
    const token = await auth0.getAccessTokenSilently();
    console.log('✅ Token obtained:', token.substring(0, 50) + '...');
    return token;
  } catch (error) {
    console.error('❌ Error getting token:', error);
    return null;
  }
})();
```

### 2. Decode Token (View Token Contents)

```javascript
// Decode JWT token to see what's inside
async function decodeToken() {
  const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
  if (!token) {
    console.error('No token available');
    return;
  }
  
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('Invalid token format');
    return;
  }
  
  try {
    const payload = JSON.parse(atob(parts[1]));
    console.log('📋 Token Payload:', payload);
    console.log('🔑 Key info:');
    console.log('  - sub (auth0_id):', payload.sub);
    console.log('  - aud (audience):', payload.aud);
    console.log('  - iss (issuer):', payload.iss);
    console.log('  - email:', payload.email);
    console.log('  - name:', payload.name);
    return payload;
  } catch (e) {
    console.error('Error decoding token:', e);
  }
}

decodeToken();
```

### 3. Test Debug Endpoint

```javascript
// Test the debug endpoint to see user state
async function testDebugEndpoint() {
  try {
    const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
    if (!token) {
      console.error('No token available');
      return;
    }
    
    const response = await fetch('https://api.transparent.city/api/cities/debug/current-user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Request failed:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    console.log('🔍 Debug Endpoint Response:');
    console.log(JSON.stringify(data, null, 2));
    
    // Highlight key issues
    console.log('\n📊 Diagnosis:');
    console.log('  - Has db_user_id:', data.diagnosis?.has_db_user_id);
    console.log('  - User exists in DB:', data.diagnosis?.user_exists_in_db);
    console.log('  - db_user_id matches:', data.diagnosis?.db_user_id_matches);
    console.log('  - auth0_id matches:', data.diagnosis?.auth0_id_matches);
    
    if (!data.diagnosis?.has_db_user_id) {
      console.warn('⚠️ PROBLEM: db_user_id is missing!');
      console.log('Token sub:', data.token_info?.sub);
      console.log('Database user auth0_id:', data.database_user?.auth0_id);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDebugEndpoint();
```

### 4. Test Sessions Endpoint

```javascript
// Test if sessions endpoint works
async function testSessions() {
  try {
    const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
    if (!token) {
      console.error('No token available');
      return;
    }
    
    const response = await fetch('https://api.transparent.city/api/chat/sessions?limit=20&offset=0', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Request failed:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const sessions = await response.json();
    console.log('💬 Sessions:', sessions);
    console.log('📊 Count:', sessions.length);
    
    return sessions;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSessions();
```

### 5. Test Saved Cities Endpoint

```javascript
// Test if saved cities endpoint works
async function testSavedCities() {
  try {
    const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
    if (!token) {
      console.error('No token available');
      return;
    }
    
    const response = await fetch('https://api.transparent.city/api/cities/saved', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Request failed:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const cities = await response.json();
    console.log('🏙️ Saved Cities:', cities);
    console.log('📊 Count:', cities.length);
    
    return cities;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSavedCities();
```

### 6. Complete Diagnostic Script

```javascript
// Run all diagnostics at once
async function runFullDiagnostic() {
  console.log('🔍 Starting Full Authentication Diagnostic...\n');
  
  // 1. Get token
  console.log('1️⃣ Getting token...');
  const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
  if (!token) {
    console.error('❌ Cannot get token. Are you logged in?');
    return;
  }
  console.log('✅ Token obtained\n');
  
  // 2. Decode token
  console.log('2️⃣ Decoding token...');
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  console.log('Token sub (auth0_id):', payload.sub);
  console.log('Token audience:', payload.aud);
  console.log('Token issuer:', payload.iss);
  console.log('');
  
  // 3. Test debug endpoint
  console.log('3️⃣ Testing debug endpoint...');
  const debugResponse = await fetch('https://api.transparent.city/api/cities/debug/current-user', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const debugData = await debugResponse.json();
  console.log('Debug data:', debugData);
  console.log('');
  
  // 4. Test sessions
  console.log('4️⃣ Testing sessions endpoint...');
  const sessionsResponse = await fetch('https://api.transparent.city/api/chat/sessions?limit=20&offset=0', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const sessions = await sessionsResponse.json();
  console.log('Sessions count:', sessions.length);
  console.log('');
  
  // 5. Test saved cities
  console.log('5️⃣ Testing saved cities endpoint...');
  const citiesResponse = await fetch('https://api.transparent.city/api/cities/saved', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const cities = await citiesResponse.json();
  console.log('Saved cities count:', cities.length);
  console.log('');
  
  // Summary
  console.log('📊 SUMMARY:');
  console.log('  - Token sub:', payload.sub);
  console.log('  - db_user_id:', debugData.current_user?.db_user_id);
  console.log('  - User exists in DB:', debugData.diagnosis?.user_exists_in_db);
  console.log('  - Sessions found:', sessions.length);
  console.log('  - Cities found:', cities.length);
  
  if (!debugData.diagnosis?.has_db_user_id) {
    console.warn('\n⚠️ ISSUE FOUND: db_user_id is missing!');
    console.warn('This is why sessions and cities are empty.');
  }
}

runFullDiagnostic();
```

## Alternative: Using React DevTools

If you have React DevTools installed, you can also inspect the Auth0 context:

1. Open React DevTools
2. Find the `Auth0Provider` component
3. Inspect the `value` prop to see the Auth0 context
4. Look for `getAccessTokenSilently` function

## Network Tab Inspection

1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for requests to `/api/chat/sessions` or `/api/cities/saved`
4. Click on a request to see:
   - **Request Headers**: Check if `Authorization: Bearer ...` is present
   - **Response**: See what the server returned
   - **Status Code**: Should be 200, not 401 or 403

## Common Issues to Check

### Issue 1: Token Not Being Sent
**Symptom**: 401 Unauthorized errors
**Check**: Network tab → Request Headers → Look for `Authorization` header

### Issue 2: Wrong Audience
**Symptom**: Token decodes but API rejects it
**Check**: Token `aud` field should match backend `AUTH0_AUDIENCE`

### Issue 3: db_user_id Missing
**Symptom**: Sessions/cities return empty arrays
**Check**: Run debug endpoint, look for `db_user_id` in response

### Issue 4: User Not in Database
**Symptom**: Debug endpoint shows user not found
**Check**: Backend logs should show "No user found in database"

## Quick Copy-Paste Script

For the fastest debugging, just paste this entire block:

```javascript
(async () => {
  const token = await window.__AUTH0_REACT__?.getAccessTokenSilently();
  if (!token) return console.error('No token');
  
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Token sub:', payload.sub);
  
  const debug = await fetch('https://api.transparent.city/api/cities/debug/current-user', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  
  console.log('Debug:', debug);
  console.log('Has db_user_id:', debug.diagnosis?.has_db_user_id);
  console.log('Sessions:', await fetch('https://api.transparent.city/api/chat/sessions', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json()));
})();
```










