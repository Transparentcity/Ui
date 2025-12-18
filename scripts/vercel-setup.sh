#!/bin/bash
# Vercel Setup Script for TransparentCity UI
# This script helps verify prerequisites before Vercel deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}==>${NC} $1"
}

echo ""
echo "=============================================="
echo "  TransparentCity UI - Vercel Setup Check"
echo "=============================================="
echo ""

# Check if we're in the right directory
print_step "Checking project structure..."
if [ ! -f "package.json" ] || [ ! -f "next.config.ts" ]; then
    print_error "Not in transparentcity-ui root directory."
    print_error "Please run from the project root."
    exit 1
fi
print_status "In correct directory"

# Check Node.js version
print_step "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed."
    echo "Install from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warning "Node.js version is less than 18. Recommended: Node.js 18+"
else
    print_status "Node.js version: $(node -v)"
fi

# Check npm
print_step "Checking npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
fi
print_status "npm version: $(npm -v)"

# Check if dependencies are installed
print_step "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Installing dependencies..."
    npm install
else
    print_status "Dependencies installed"
fi

# Check for required files
print_step "Checking required configuration files..."
REQUIRED_FILES=("vercel.json" "next.config.ts" "package.json")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_status "Found $file"
    else
        print_error "Missing required file: $file"
        exit 1
    fi
done

# Check environment variables documentation
print_step "Checking environment variables..."
if [ -f "ENV_SETUP.md" ]; then
    print_status "Environment variables documented in ENV_SETUP.md"
else
    print_warning "ENV_SETUP.md not found"
fi

# Test build
print_step "Testing build..."
if npm run build > /dev/null 2>&1; then
    print_status "Build successful"
else
    print_error "Build failed. Please fix errors before deploying."
    echo "Run 'npm run build' to see detailed errors."
    exit 1
fi

# Check DNS (if domain is provided)
if [ -n "$1" ]; then
    print_step "Checking DNS for $1..."
    if dig +short "$1" | grep -q .; then
        print_status "DNS resolves for $1"
        RESOLVED_IP=$(dig +short "$1" | head -1)
        echo "  Resolved to: $RESOLVED_IP"
    else
        print_warning "DNS not yet configured for $1"
        echo "  See DNS_SETUP.md for instructions"
    fi
fi

# Summary
echo ""
echo "=============================================="
echo "  Setup Check Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Set up DNS (see DNS_SETUP.md)"
echo "  2. Go to https://vercel.com/new"
echo "  3. Import your GitHub repository"
echo "  4. Configure environment variables:"
echo "     - NEXT_PUBLIC_API_BASE_URL=https://api.transparent.city"
echo "     - NEXT_PUBLIC_SITE_URL=https://app.transparent.city"
echo "  5. Add custom domain: app.transparent.city"
echo "  6. Deploy!"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo ""

