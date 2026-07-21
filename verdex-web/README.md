# Verdex Web — Next.js Frontend

Premium redesign of [verdexswap.site](https://verdexswap.site) built with the
Next.js App Router. It preserves the real Verdex product — decentralized swaps,
liquidity pools, VDX mining, the CLI miner downloads, Supabase accounts, and the
wallet dashboard — unified under one design system.

See `docs/PRODUCT-ANALYSIS.md` for the full current-product audit this build is
based on.

## Stack

- **Next.js 14 (App Router) + TypeScript**
- **Tailwind CSS** design system (emerald/cyan on near-black)
- **Framer Motion** — scroll reveals, micro-interactions
- **React Three Fiber** — lazy-loaded 3D Verdex crystal hero (WebGL fallback included)
- **Recharts** — mining & earnings charts
- **Supabase JS** — the same production auth backend (email + Google OAuth + code verification)
- **TanStack Query** — live API data (`/api/network`, `/api/mining/status`, …)
- **React Hook Form + Zod** — validated auth & wallet forms
- **shadcn-style primitives** (Radix) · Lucide icons · Sonner toasts

## Run it

```bash
npm install
npm run dev
# → http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

## Environment (optional)

```env
# Defaults point at the production backend; override for staging/dev.
NEXT_PUBLIC_API_BASE=https://verdexswap.site
NEXT_PUBLIC_SUPABASE_URL=https://unbzescopxtmtbrgqlhh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public anon key>
```

## Structure

```
src/
├── app/
│   ├── (marketing)/   home · swap · liquidity(+add) · earn · mining · vdx ·
│   │                  ecosystem · whitepaper · docs · security · roadmap
│   ├── (auth)/        sign-in · register (+ email code verification)
│   └── (platform)/    dashboard · wallet · mining · downloads · activity ·
│                      rewards · transactions · settings  (auth-guarded shell)
├── components/
│   ├── ui/            button, card, dialog, tabs, table, switch, …
│   ├── layout/        navbar, footer, platform shell, bottom nav
│   ├── wallet/        EIP-1193 connector, modal, network selector
│   ├── auth/          Supabase auth provider
│   ├── swap/          swap card (all states), token selector, route visual
│   ├── liquidity/     pool explorer (filters + sort + card/table)
│   ├── mining/        status pill, worker table, hashrate chart
│   ├── charts/        area / bar / donut wrappers (Recharts)
│   ├── three/         3D Verdex crystal (lazy) + fallback
│   └── shared/        states (empty/error/offline/auth), stat cards, QR, …
└── lib/
    ├── constants.ts   real networks, tokens, links, downloads
    ├── mock-data.ts   labeled demo data (never mixed with live data)
    ├── api.ts         typed client for the production serverless API
    ├── supabase.ts    production Supabase client (anon, RLS-protected)
    ├── whitepaper-content.ts / docs-content.ts
    └── types.ts / format.ts / utils.ts
```

## Product rules honored

- No invented features, audits, partnerships, tokenomics, or financial claims.
- Placeholder values are always marked with a **Demo** badge; live values come
  from the real API endpoints.
- Mining, the CLI miner, and downloads stay first-class citizens.
- No seed phrases are ever requested. Signing stays in wallet software.
