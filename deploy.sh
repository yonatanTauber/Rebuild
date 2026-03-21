#!/bin/bash

# Mobile Optimization Deploy Script
# Run this in your rebuild directory

echo "🚀 Starting deploy..."

# 1. Check git status
echo "📋 Git status:"
git status

# 2. Add the CSS file
echo "📝 Adding globals.css..."
git add src/app/globals.css

# 3. Commit
echo "✍️ Creating commit..."
git commit -m "chore: add mobile optimization for iPhone (375-430px) breakpoint

- Added @media (max-width: 430px) breakpoint for iPhone SE/12 mini
- Optimized typography, spacing, and layout for small screens
- Ensured all touch targets are minimum 44x44px (accessibility)
- Implemented responsive grid stacking
- Improved mobile navigation and form elements"

# 4. Push to GitHub
echo "🚀 Pushing to GitHub..."
git push origin master

# 5. Check if successful
if [ $? -eq 0 ]; then
    echo "✅ Deploy successful!"
    echo "Vercel will auto-deploy your changes now."
    echo "Check: https://vercel.com/yonatan-taubers-projects/rebuild"
else
    echo "❌ Push failed. Try:"
    echo "   git push origin main"
    echo "(if your branch is 'main' instead of 'master')"
fi
