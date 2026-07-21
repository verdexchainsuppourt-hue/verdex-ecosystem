# Verdex — Vercel Deployment Guide

## Quick Deploy (5 minutes)

### 1. Get a Vercel Token
1. Go to https://vercel.com and sign up (use GitHub login)
2. Go to https://vercel.com/account/tokens
3. Click "Create Token"
4. Name: `verdex-deploy`
5. Copy the token (looks like: `vercel_xxxxxxxxx`)

### 2. Deploy via Git
1. Push this folder to GitHub
2. Go to https://vercel.com/new
3. Import your repo
4. Framework: Other
5. Click "Deploy" — done!

### 3. Deploy via CLI
```powershell
npm i -g vercel
vercel login --token YOUR_TOKEN
cd C:\Users\kidst\Videos\verdex-website
vercel --prod
```

### 4. Add Custom Domain
1. Vercel Dashboard → your project → Settings → Domains
2. Add `verdex.finance`
3. Add the DNS records to your registrar
4. Free SSL is automatic

## Token Locations
- Account tokens: https://vercel.com/account/tokens
- Team tokens: https://vercel.com/teams/[team]/tokens

## Vercel Free Plan Limits
- 100 GB bandwidth/month
- 100 GB storage
- Unlimited static deployments
- Free SSL
- Free custom domains
- Perfect for Verdex!

## Notes
- This is a static site (no build step needed)
- Vercel auto-detects HTML/CSS/JS
- vercel.json is already configured
- All assets are cached for 1 year (fast loading)
