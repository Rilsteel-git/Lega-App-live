# Lega React

Remake of `personal-wallet` built with:

- React + TypeScript + Vite
- Supabase Auth, Postgres, Row Level Security, and Storage
- Tailwind CSS v4 + Lega design system
- Chart.js via `react-chartjs-2`

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project, then run the full `supabase/schema.sql` via **Supabase Dashboard → SQL Editor**.

3. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Fill in `.env.local` using values from **Supabase Dashboard → Project Settings → API**:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

Open the URL Vite prints, usually `http://localhost:5173`.

## Features

- Register, login, logout with Supabase Auth
- Dashboard with total balance, monthly summary, wallets, and recent activity
- Wallet CRUD with a running balance derived from opening balance + transactions
- Transaction CRUD with type, category, wallet, amount, date, note, filters, edit, and delete
- Category CRUD with archive/restore while still referenced by transaction history
- Weekly/monthly statistics with period navigation, doughnut chart, bar chart, and period comparison
- Profile name and avatar photo
- Reset financial data without deleting the profile
- Mobile-only shell, max width 430px per the PRD
- Installable PWA with a standalone app window and update prompt

## Scripts

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
npm run generate:pwa-icons
npm run generate:native-assets
npm run cap:sync
```

## PWA

The production build generates `manifest.webmanifest` and a service worker. After deployment over HTTPS, install Lega from the browser's app menu on Android or Add to Home Screen in Safari on iPhone. For a local PWA check, run `npm run build` and then `npm run preview`; the service worker is not enabled by `npm run dev`.

The service worker caches the app shell and static assets. Wallet and transaction data still need a connection to Supabase. If the logo changes, run `npm run generate:pwa-icons` to regenerate the install icons from `public/lega-app-icon.png`.

## Android and iOS apps

The mobile apps use Capacitor to package the same React app for Android and iOS. Build and sync the web app into both native projects with:

```bash
npm run cap:sync
```

Open the Android project with `npm run cap:open:android` and the iOS project with `npm run cap:open:ios`. Android builds require Android Studio and the Android SDK. iOS builds and signing require macOS with Xcode. Android and iOS app updates are distributed through their installed package or store release; Vercel deployments continue updating the PWA/web version.

Email confirmation links in the native apps use `com.rilsteel.maniapp://login-callback`. Add this exact URL to the Supabase Auth redirect URL allow list before testing native registration. The current application ID is `com.rilsteel.maniapp`; confirm it is available and final before publishing to either app store.

Password reset emails use Supabase Auth. For a small free beta without a sending domain, a dedicated Gmail account can be connected as custom SMTP: enable Google 2-Step Verification, create an App Password, then enter `smtp.gmail.com`, port `465`, the Gmail address as both SMTP username and sender address, and the App Password in **Supabase Dashboard → Authentication → SMTP Settings**. Keep the App Password private. The Gmail sender address will be visible to users; switch to a verified domain with an email provider such as Resend when you want branded mail.

In **Supabase Dashboard → Authentication → URL Configuration**, set the Site URL to the production Vercel address and add these Redirect URLs:

- `https://<production-vercel-host>/**`
- `http://localhost:5173/**` (local development)
- `com.rilsteel.maniapp://login-callback`
- `com.rilsteel.maniapp://login-callback?mode=recovery`

The web/PWA reset link opens the site where the request began; Android and iOS reset links return to the installed app.

## Git workflow

See `.claude/skills/git-workflow/SKILL.md` for the branching model this repo
follows: `module/<name>` branches for feature work, merged into `dev` once a
local build passes, then `dev` merged into `Master` (production, deployed on
Vercel) only after CI/CD is green.

## Multi-currency setup

After running `supabase/schema.sql`, run `supabase/migrations/20260921_multi_currency.sql` in the Supabase SQL Editor (required for both new and existing projects). The migration adds columns and validation triggers; existing wallets and transactions remain IDR at rate 1. It does not delete records. Apply it before using this version's wallet or transaction forms.

- Create a wallet with its native currency. Currency is immutable after creation.
- Enter the opening balance and the wallet's manual valuation rate: **IDR per 1 unit** of the wallet currency. Use the "Get live rate" button to prefill it from a daily exchange-rate API, then adjust if needed.
- Transactions inherit the wallet's currency and its saved exchange rate (not manually entered per transaction).
- Profile → Settings → Report currency chooses the dashboard/statistics currency and manual display rate.
- Activity → Filter currency filters original currencies. Display amounts switches between original and report amounts.
- Income and expense reports convert each transaction using its saved rate to IDR, then divide by the chosen report rate. Combined wallet balances convert native balances using each wallet's manual valuation rate. A zero native balance therefore remains zero. These are estimates, not live portfolio valuation or realized FX gain/loss accounting.
- Native wallet balances always use original amounts. Switching report currency never overwrites those amounts.
- IDR/KRW/JPY accept whole units; USD/EUR/SGD/MYR accept up to two decimal places. Inputs accept a decimal dot or comma without thousands separators.
- Inter-wallet foreign-exchange transfers are not included in v1.

Run `npm test` and `npm run build` for local verification. Database trigger integration requires applying the SQL migration to your Supabase project.
