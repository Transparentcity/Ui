// Browser Console Debugging Script for Authentication
// Paste this entire script into your browser console

(async function debugAuth() {
  console.log('🔍 Starting Authentication Debug...\n');
  
  try {
    // Method 1: Try to get token from Auth0 React context
    // This works if you're on a page with Auth0Provider
    let token = null;
    
    // Check if we can access Auth0 from React DevTools
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      console.log('✅ React DevTools detected');
    }
    
    // Try to get token via fetch to a test endpoint that requires auth
    // We'll use the debug endpoint which will show us the token info
    console.log('1️⃣ Attempting to get token and test debug endpoint...\n');
    
    // Since we can't directly access Auth0 context from console,
    // we need to intercept network requests or use a different approach
    
    // Alternative: Check localStorage for Auth0 cache
    console.log('2️⃣ Checking Auth0 cache in localStorage...');
    const auth0Cache = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.includes('auth0') || key.includes('@@auth0spa')) {
        try {
          const value = JSON.parse(localStorage.getItem(key));
          auth0Cache[key] = value;
          console.log(`Found: ${key}`, value);
        } catch (e) {
          auth0Cache[key] = localStorage.getItem(key);
        }
      }
    }
    
    if (Object.keys(auth0Cache).length === 0) {
      console.warn('⚠️ No Auth0 cache found in localStorage');
    }
    
    console.log('\n3️⃣ To get your token, you need to:');
    console.log('   Option A: Use React DevTools');
    console.log('   - Install React DevTools extension');
    console.log('   - Find Auth0Provider component');
    console.log('   - Inspect the context value');
    console.log('   - Call getAccessTokenSilently()');
    console.log('');
    console.log('   Option B: Intercept network requests');
    console.log('   - Open Network tab');
    console.log('   - Find a request to /api/chat/sessions or /api/cities/saved');
    console.log('   - Check Request Headers → Authorization');
    console.log('   - Copy the Bearer token');
    console.log('');
    console.log('   Option C: Use the helper function below');
    
    // Helper function to decode token
    window.decodeToken = function(tokenString) {
      if (!tokenString) {
        console.error('No token provided');
        return null;
      }
      
      // Remove "Bearer " prefix if present
      const token = tokenString.replace(/^Bearer\s+/i, '');
      const parts = token.split('.');
      
      if (parts.length !== 3) {
        console.error('Invalid token format');
        return null;
      }
      
      try {
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        
        console.log('📋 Token Header:', header);
        console.log('📋 Token Payload:', payload);
        console.log('');
        console.log('🔑 Key Information:');
        console.log('  - sub (auth0_id):', payload.sub);
        console.log('  - aud (audience):', payload.aud);
        console.log('  - iss (issuer):', payload.iss);
        console.log('  - exp (expires):', new Date(payload.exp * 1000).toLocaleString());
        console.log('  - email:', payload.email || 'not in token');
        console.log('  - name:', payload.name || 'not in token');
        
        return { header, payload };
      } catch (e) {
        console.error('Error decoding token:', e);
        return null;
      }
    };
    
    // Helper function to test API endpoint
    window.testAPIEndpoint = async function(endpoint, token) {
      if (!token) {
        console.error('No token provided. Get it from Network tab → Request Headers → Authorization');
        return;
      }
      
      const url = `https://api.transparent.city${endpoint}`;
      console.log(`Testing: ${url}`);
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': token.startsWith('Bearer') ? token : `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
          console.error('Response:', text);
          return null;
        }
        
        const data = await response.json();
        console.log('✅ Response:', data);
        return data;
      } catch (error) {
        console.error('❌ Error:', error);
        return null;
      }
    };
    
    // Helper function to run full diagnostic
    window.runAuthDiagnostic = async function(token) {
      if (!token) {
        console.error('No token provided. Usage: runAuthDiagnostic("your-bearer-token-here")');
        console.log('Get token from: Network tab → Find API request → Request Headers → Authorization');
        return;
      }
      
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      
      console.log('🔍 Running Full Diagnostic...\n');
      
      // Decode token
      console.log('1️⃣ Decoding token...');
      const decoded = window.decodeToken(cleanToken);
      if (!decoded) return;
      console.log('');
      
      // Test debug endpoint
      console.log('2️⃣ Testing debug endpoint...');
      const debug = await window.testAPIEndpoint('/api/cities/debug/current-user', `Bearer ${cleanToken}`);
      console.log('');
      
      // Test sessions
      console.log('3️⃣ Testing sessions endpoint...');
      const sessions = await window.testAPIEndpoint('/api/chat/sessions?limit=20&offset=0', `Bearer ${cleanToken}`);
      console.log('');
      
      // Test saved cities
      console.log('4️⃣ Testing saved cities endpoint...');
      const cities = await window.testAPIEndpoint('/api/cities/saved', `Bearer ${cleanToken}`);
      console.log('');
      
      // Summary
      console.log('📊 DIAGNOSTIC SUMMARY:');
      console.log('  Token sub (auth0_id):', decoded.payload.sub);
      console.log('  db_user_id:', debug?.current_user?.db_user_id || 'MISSING ⚠️');
      console.log('  User exists in DB:', debug?.diagnosis?.user_exists_in_db ? '✅' : '❌');
      console.log('  Sessions found:', sessions?.length || 0);
      console.log('  Saved cities found:', cities?.length || 0);
      console.log('');
      
      if (!debug?.diagnosis?.has_db_user_id) {
        console.warn('⚠️ ISSUE DETECTED: db_user_id is missing!');
        console.warn('This is why sessions and cities are empty.');
        console.warn('Token sub:', decoded.payload.sub);
        console.warn('Database user auth0_id:', debug?.database_user?.auth0_id);
        if (decoded.payload.sub !== debug?.database_user?.auth0_id) {
          console.warn('⚠️ MISMATCH: Token sub does not match database auth0_id!');
        }
      } else {
        console.log('✅ Authentication looks good!');
      }
    };
    
    console.log('\n✅ Helper functions loaded!');
    console.log('');
    console.log('📝 Usage:');
    console.log('  1. Get your token from Network tab (find any API request → Request Headers → Authorization)');
    console.log('  2. Run: decodeToken("your-token-here")');
    console.log('  3. Or run full diagnostic: runAuthDiagnostic("Bearer your-token-here")');
    console.log('');
    console.log('💡 Tip: In Network tab, right-click on a request → Copy → Copy as cURL');
    console.log('   Then look for the Authorization header in the curl command');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();

