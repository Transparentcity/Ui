#!/usr/bin/env node

/**
 * Auth0 Configuration Verification Script
 * 
 * This script helps verify that you're using the correct Auth0 application
 * and provides guidance on updating the logo in Auth0 dashboard.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Auth0 Configuration Verification\n');
console.log('=' .repeat(60));

// Check for environment files
const envFiles = ['.env.local', '.env', '.env.production'];
const envVars = {};

envFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`\n📄 Found ${file}:`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key.includes('AUTH0')) {
          envVars[key] = value;
          // Mask sensitive values
          const displayValue = key.includes('CLIENT_ID') || key.includes('SECRET')
            ? value.substring(0, 8) + '...' + value.substring(value.length - 4)
            : value;
          console.log(`   ${key}=${displayValue}`);
        }
      }
    });
  }
});

// Check required variables
console.log('\n📋 Required Auth0 Environment Variables:');
const required = [
  'NEXT_PUBLIC_AUTH0_DOMAIN',
  'NEXT_PUBLIC_AUTH0_CLIENT_ID',
  'NEXT_PUBLIC_AUTH0_AUDIENCE'
];

let allPresent = true;
required.forEach(key => {
  const present = envVars[key] || process.env[key];
  if (present) {
    const displayValue = key.includes('CLIENT_ID')
      ? present.substring(0, 8) + '...' + present.substring(present.length - 4)
      : present;
    console.log(`   ✅ ${key}=${displayValue}`);
  } else {
    console.log(`   ❌ ${key} - MISSING`);
    allPresent = false;
  }
});

if (!allPresent) {
  console.log('\n⚠️  Some required variables are missing!');
  console.log('   Create a .env.local file with:');
  console.log('   NEXT_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com');
  console.log('   NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id');
  console.log('   NEXT_PUBLIC_AUTH0_AUDIENCE=your-audience');
}

// Verify domain format
const domain = envVars['NEXT_PUBLIC_AUTH0_DOMAIN'] || process.env['NEXT_PUBLIC_AUTH0_DOMAIN'];
if (domain) {
  console.log('\n🌐 Domain Format Check:');
  const validFormats = [
    domain.includes('.auth0.com'),
    domain.includes('.us.auth0.com'),
    domain.includes('.eu.auth0.com'),
    domain.includes('.au.auth0.com')
  ];
  
  if (validFormats.some(f => f)) {
    console.log(`   ✅ Domain format looks correct: ${domain}`);
  } else {
    console.log(`   ⚠️  Domain format might be incorrect: ${domain}`);
    console.log('   Expected format: your-tenant.auth0.com');
  }
}

// Logo information
console.log('\n🖼️  Logo Assets Available:');
const publicImages = path.join(process.cwd(), 'public', 'images');
if (fs.existsSync(publicImages)) {
  const logoFiles = fs.readdirSync(publicImages).filter(f => 
    f.includes('logo') && (f.endsWith('.png') || f.endsWith('.svg'))
  );
  
  if (logoFiles.length > 0) {
    logoFiles.forEach(file => {
      const filePath = path.join(publicImages, file);
      const stats = fs.statSync(filePath);
      console.log(`   📄 ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    });
    
    console.log('\n💡 Recommended logo for Auth0:');
    console.log('   Use: /images/logo-combined.png');
    console.log('   Full URL: https://app.transparent.city/images/logo-combined.png');
  } else {
    console.log('   ⚠️  No logo files found in public/images/');
    console.log('   Run: npm run generate-auth0-assets');
  }
} else {
  console.log('   ⚠️  public/images/ directory not found');
}

// Instructions
console.log('\n' + '='.repeat(60));
console.log('\n📝 Next Steps to Fix Logo Issue:\n');
console.log('1. Verify Auth0 Application:');
console.log('   → Go to https://manage.auth0.com/dashboard/');
console.log('   → Navigate to Applications → Your App');
console.log('   → Check that Client ID matches: ' + 
  (envVars['NEXT_PUBLIC_AUTH0_CLIENT_ID'] || process.env['NEXT_PUBLIC_AUTH0_CLIENT_ID'] || 'YOUR_CLIENT_ID'));
console.log('   → Check that Domain matches: ' + 
  (domain || 'YOUR_DOMAIN'));

console.log('\n2. Update Logo in Auth0 Dashboard:');
console.log('   → Go to Branding → Universal Login → Login');
console.log('   → Scroll to "Logo" section');
console.log('   → Upload or set logo URL to:');
console.log('     https://app.transparent.city/images/logo-combined.png');
console.log('   → Or use a direct image URL from your public folder');

console.log('\n3. Alternative: Use Custom Domain Logo:');
console.log('   → If you have a custom Auth0 domain, you can also:');
console.log('   → Go to Branding → Universal Login → Login');
console.log('   → Enable "Customize Login Page"');
console.log('   → Add logo in the HTML template');

console.log('\n4. Verify Changes:');
console.log('   → Clear browser cache');
console.log('   → Log out and log back in');
console.log('   → Check that the correct logo appears');

console.log('\n5. If Still Seeing Wrong Logo:');
console.log('   → Check if you have multiple Auth0 applications');
console.log('   → Verify you\'re using the correct Client ID');
console.log('   → Check Auth0 tenant settings (not just app settings)');
console.log('   → Look for "Default Directory" branding settings');

console.log('\n' + '='.repeat(60));
console.log('\n✨ Verification complete!\n');

