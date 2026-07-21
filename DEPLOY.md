# Verdex Deployment Guide

**Everything is ready to deploy to Netlify. Follow this guide step-by-step.**

---

## Quick Start (2 minutes)

### Method 1: Drag & Drop (Easiest)

1. Go to **https://app.netlify.com/drop**
2. Open Windows Explorer and navigate to: `C:\Users\kidst\Videos\verdex-website`
3. **Drag the entire `verdex-website` folder** into the browser window
4. Wait 30 seconds
5. Your site is **live** with a random URL like `https://random-name-123.netlify.app`
6. (Optional) Click "Site settings" to rename it to `verdex.netlify.app`

### Method 2: Git + Netlify (Recommended for tomorrow's launch)

1. Create a GitHub repository
2. Push the `verdex-website` folder contents
3. Log in to **https://app.netlify.com**
4. Click "Add new site" → "Import an existing project"
5. Connect your GitHub repo
6. Leave all settings as default
7. Click "Deploy site"

---

## Pre-Deployment Checklist

Before you deploy tomorrow, verify these items:

- [ ] Open `index.html` in your browser — does it look great?
- [ ] Click all navigation links — do they scroll smoothly?
- [ ] Test the waitlist form — does it show the success message?
- [ ] Check the countdown — does it show time until Dec 12, 2026?
- [ ] Open `whitepaper.html` — does the developer credit show?
- [ ] Test the "Download PDF" button — does it download?
- [ ] Check mobile view — resize your browser to mobile size

---

## What's Included

```
verdex-website/
├── index.html              Main landing page (24KB)
├── whitepaper.html         Full whitepaper (22KB)
├── README.md               This file
├── _redirects              Netlify SPA routing
├── .gitignore              Excludes Python scripts
├── css/
│   └── style.css           Cinematic dark theme (30KB)
├── js/
│   └── main.js             Animations & interactivity (8KB)
├── assets/
│   ├── verdex_logo_cinematic.gif    Hero animation (2.2MB)
│   ├── verdex_logo_cinematic.mp4    MP4 version (2.4MB)
│   ├── animation.gif                Backup animation v1
│   ├── animation-v2.gif             Backup animation v2
│   ├── animation.mp4                MP4 version
│   ├── animation-v2.mp4             MP4 version
│   └── verdex-whitepaper.pdf        Downloadable whitepaper (14KB)
```

---

## After Deployment

### Rename Your Site (Free)

1. Go to your site's dashboard on Netlify
2. Click "Site settings" → "Change site name"
3. Enter `verdex` (or your preferred name)
4. Your site is now at `verdex.netlify.app`

### Add a Custom Domain (Optional)

1. Buy a domain like `verdex.finance` from Namecheap, GoDaddy, or Cloudflare
2. In Netlify, go to "Domain settings" → "Add custom domain"
3. Follow the DNS instructions
4. Free SSL is automatic

### Track Visitors (Optional)

1. Go to "Site overview" on Netlify
2. Enable "Analytics" (free tier available)
3. See real-time visitors, page views, and traffic sources

---

## Updates & Maintenance

### To Update the Countdown After Dec 12, 2026

1. Open `js/main.js`
2. Find this line: `const countdownDate = new Date('2026-12-12T00:00:00').getTime();`
3. Change the date
4. If using Git: commit and push — Netlify auto-deploys
5. If using drag & drop: just drag the folder again

### To Add Social Links

1. Open `index.html`
2. Find the footer "Community" section
3. Replace `href="#"` with your actual Twitter, Discord, Telegram, GitHub URLs
4. Save and re-deploy

### To Change Colors or Text

- All colors are defined at the top of `css/style.css` in `:root`
- All text content is in `index.html` and `whitepaper.html`

---

## Support

If anything breaks after deployment:
1. Check the browser console (F12) for errors
2. Verify all files in the `verdex-website` folder are present
3. Try clearing your browser cache (Ctrl+Shift+R)
4. Re-drag the folder to Netlify

---

**Your Verdex website is production-ready. Deploy with confidence.**
