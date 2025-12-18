const sharp = require('sharp');
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public', 'images');
const logoSvgPath = path.join(publicDir, 'logo.svg');

// Ensure public/images directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function generateLogoPNG() {
  try {
    console.log('🖼️  Converting logo SVG to PNG...');
    
    // Convert SVG to PNG with high resolution for Auth0
    // Auth0 recommends at least 150x150px, we'll make it 200x200 for better quality
    await sharp(logoSvgPath)
      .resize(200, 200, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(path.join(publicDir, 'logo.png'));
    
    console.log('✅ Logo PNG created: public/images/logo.png');
  } catch (error) {
    console.error('❌ Error generating logo PNG:', error);
    throw error;
  }
}

async function generateTextPNG() {
  try {
    console.log('📝 Generating transparent.city text PNG...');
    
    // Create canvas with appropriate size
    // Based on the header styling: font-size 18px, font-weight 700
    const width = 200;
    const height = 60;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Set transparent background
    ctx.clearRect(0, 0, width, height);
    
    // Set font properties matching the header styling
    // Font: Arial, Helvetica, sans-serif (fallback)
    // Font size: 18px, Font weight: 700
    ctx.font = '700 18px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'middle';
    
    // Measure text to center it
    const fullText = 'transparent.city';
    const transparentText = 'transparent';
    const cityText = '.city';
    
    // Calculate positions
    const transparentWidth = ctx.measureText(transparentText).width;
    const cityWidth = ctx.measureText(cityText).width;
    const totalWidth = transparentWidth + cityWidth;
    const startX = (width - totalWidth) / 2;
    const y = height / 2;
    
    // Draw "transparent" in dark gray (#222222)
    ctx.fillStyle = '#222222';
    ctx.fillText(transparentText, startX, y);
    
    // Draw ".city" in brand purple (#ad35fa)
    ctx.fillStyle = '#ad35fa';
    ctx.fillText(cityText, startX + transparentWidth, y);
    
    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(publicDir, 'logo-text.png'), buffer);
    
    console.log('✅ Text PNG created: public/images/logo-text.png');
  } catch (error) {
    console.error('❌ Error generating text PNG:', error);
    throw error;
  }
}

async function generateCombinedPNG() {
  try {
    console.log('🎨 Generating combined logo + text PNG...');
    
    // Load logo as buffer (26px size to match header, scaled 2x for quality)
    const logoSize = 52; // 2x for retina quality
    const logoBuffer = await sharp(logoSvgPath)
      .resize(logoSize, logoSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    // Create canvas for combined image
    // Logo (52px) + gap (24px) + text width
    const gap = 24; // 12px * 2 for retina
    const textFontSize = 36; // 18px * 2 for retina
    
    // Create temporary canvas to measure text
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `700 ${textFontSize}px Arial, Helvetica, sans-serif`;
    
    const transparentText = 'transparent';
    const cityText = '.city';
    const transparentWidth = tempCtx.measureText(transparentText).width;
    const cityWidth = tempCtx.measureText(cityText).width;
    const textWidth = transparentWidth + cityWidth;
    
    // Calculate total dimensions
    const padding = 20; // Extra padding around edges
    const canvasWidth = logoSize + gap + textWidth + (padding * 2);
    const canvasHeight = Math.max(logoSize, textFontSize * 1.2) + (padding * 2);
    
    // Create main canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    
    // Set transparent background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw logo on the left
    const logoImg = await require('canvas').loadImage(logoBuffer);
    ctx.drawImage(logoImg, padding, (canvasHeight - logoSize) / 2, logoSize, logoSize);
    
    // Draw text on the right
    const textX = padding + logoSize + gap;
    const textY = canvasHeight / 2;
    
    ctx.font = `700 ${textFontSize}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = 'middle';
    
    // Draw "transparent" in dark gray (#222222)
    ctx.fillStyle = '#222222';
    ctx.fillText(transparentText, textX, textY);
    
    // Draw ".city" in brand purple (#ad35fa)
    ctx.fillStyle = '#ad35fa';
    ctx.fillText(cityText, textX + transparentWidth, textY);
    
    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(publicDir, 'logo-combined.png'), buffer);
    
    console.log('✅ Combined PNG created: public/images/logo-combined.png');
  } catch (error) {
    console.error('❌ Error generating combined PNG:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Generating Auth0 assets...\n');
    
    await generateLogoPNG();
    await generateTextPNG();
    await generateCombinedPNG();
    
    console.log('\n✨ All assets generated successfully!');
    console.log('\n📋 Public URLs for Auth0:');
    console.log('   Logo only: /images/logo.png');
    console.log('   Text only: /images/logo-text.png');
    console.log('   Combined: /images/logo-combined.png ⭐ (Recommended)');
    console.log('\n💡 Full URLs (update with your domain):');
    console.log('   Combined: https://app.transparent.city/images/logo-combined.png');
  } catch (error) {
    console.error('\n❌ Failed to generate assets:', error);
    process.exit(1);
  }
}

main();

