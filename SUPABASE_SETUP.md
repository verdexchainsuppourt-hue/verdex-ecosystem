# Verdex — Supabase + Resend Email Setup Guide

## ⚠️ FIRST: Rotate Your Vercel Token NOW
You shared your token in chat. Go to https://vercel.com/account/tokens, delete it, and create a new one. Never paste tokens in chat — only use them in Vercel Environment Variables.

---

## What I Built

✅ Updated `api/waitlist.js` — stores email in Supabase + sends beautiful welcome email via Resend
✅ Updated `js/main.js` — frontend now calls the API endpoint
✅ Updated `package.json` — added @supabase/supabase-js dependency
✅ Created `supabase-setup.sql` — database table setup

---

## Step-by-Step Setup (15 minutes total)

### Step 1: Create Supabase Project (5 min)

1. Go to https://supabase.com → Sign up (free)
2. Click "New Project"
3. Name: `verdex`
4. Database Password: create a strong one, SAVE IT
5. Region: pick closest to you
6. Click "Create new project" (wait 2 minutes)

### Step 2: Set Up Database Table (1 min)

1. In Supabase, go to "SQL Editor" (left sidebar)
2. Click "New Query"
3. Open the file `supabase-setup.sql` from your website folder
4. Copy ALL of it, paste into the SQL editor
5. Click "Run"
6. You should see "Success. No rows returned"

### Step 3: Get Your Supabase Keys (1 min)

1. In Supabase, go to Settings (gear icon) → API
2. Copy these 2 values:
   - **Project URL** → looks like `https://xxxxx.supabase.co`
   - **service_role key** → looks like `eyJhbGciOi...` (long string)

### Step 4: Create Resend Account (3 min)

1. Go to https://resend.com → Sign up (free)
2. Go to "API Keys" → "Create API Key"
3. Name: `verdex`
4. Copy the API key → looks like `re_xxxxxxxxx`

### Step 5: Add Environment Variables to Vercel (2 min)

1. Go to your Vercel project: https://vercel.com/neteflyclaim/verdex-website
2. Click "Settings" → "Environment Variables"
3. Add these 4 variables:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | (your Supabase Project URL from Step 3) |
| `SUPABASE_SERVICE_ROLE_KEY` | (your service_role key from Step 3) |
| `RESEND_API_KEY` | (your Resend API key from Step 4) |
| `SITE_URL` | https://verdex-website.vercel.app (or your domain) |

4. Click "Save" for each one

### Step 6: Deploy to Vercel (2 min)

**Option A: If you connected GitHub**
1. Push the updated files to GitHub
2. Vercel auto-deploys

**Option B: Drag & Drop**
1. Go to https://vercel.com/neteflyclaim/verdex-website
2. Click "Deployments" → "Redeploy" → "Redeploy"

### Step 7: Test It (1 min)

1. Go to your live website
2. Scroll to the "Join Waitlist" section
3. Enter YOUR email
4. Click "Join Waitlist"
5. Check your inbox — you should receive the beautiful welcome email with the whitepaper download!

---

## What Happens When Someone Joins

```
1. User types email on website
2. Frontend sends POST to /api/waitlist
3. API stores email in Supabase database
4. API sends welcome email via Resend
5. User receives email with:
   - Verdex branding
   - Welcome message
   - Whitepaper PDF download button
   - Feature highlights
   - Social links (TikTok, Email)
6. Database marks email_sent = true
```

---

## View Your Waitlist

To see everyone who joined:
1. Go to Supabase → Table Editor → waitlist
2. You'll see all emails, dates, and email_sent status

---

## Files I Updated

| File | What Changed |
|------|-------------|
| `api/waitlist.js` | Now stores in Supabase + sends via Resend |
| `js/main.js` | Form now calls /api/waitlist endpoint |
| `package.json` | Added @supabase/supabase-js dependency |
| `supabase-setup.sql` | NEW — database table setup SQL |

---

## Cost (All Free!)

- **Supabase:** Free tier (500MB database, 50K monthly users)
- **Resend:** Free tier (3,000 emails/month)
- **Vercel:** Free tier (100GB bandwidth)
- **Total cost: $0** 🎉
