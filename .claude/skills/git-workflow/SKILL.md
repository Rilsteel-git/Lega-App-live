---
name: git-workflow
description: Git & release workflow for Lega (personal-wallet-react) — when to just work locally, when to branch per module, when it's OK to push to dev, and what's required before merging into Master (production, deployed on Vercel). Use this whenever about to commit, push, or merge a branch in this project.
---

# Git workflow — Lega (personal-wallet-react)

The production branch in this repo is **`Master`** (capital M — not `main`),
tracked directly by Vercel for production deploys. The integration branch is
**`dev`**. Follow the order below, don't skip a stage.

## Branch model

```
feature/<feature-name> ← day-to-day work per feature, start here
        │  (once it's safe locally)
        ▼
       dev             ← integration, staging before production
        │  (once CI/CD is green)
        ▼
      Master             ← production, live on Vercel
```

## Rules

1. **Default: work stays local first.** After editing files, do NOT push
   right away unless the user explicitly asks ("push", "deploy", "get it up
   to dev", etc.). Committing locally is fine, but pushing to any remote
   (`dev` or `Master`) always waits for user confirmation.

2. **Every new module/feature → a new branch off `dev`.**
   ```bash
   git checkout dev && git pull origin dev
   git checkout -b feature/<feature-name>
   ```
   Branch names use `feature/<feature-name>` in lowercase kebab-case (e.g.
   `feature/multi-currency`, `feature/receipt-scan`). One branch = one feature — don't mix
   unrelated changes in the same branch.

3. **Before merging a module branch into `dev`, confirm the module is "safe" locally:**
   ```bash
   npm run build       # tsc -b && vite build — must succeed, exit 0
   npm run typecheck    # if present, or: npx tsc --noEmit -p tsconfig.app.json
   npm test              # any tests relevant to this module
   ```
   If any of these fail, do NOT merge — fix it on the module branch first.
   Also check `git diff`/`git status` before staging, so no unintended file
   sneaks in (`.env.local`, `node_modules`, etc. — should already be
   gitignored, but double-check anyway).

4. **Once safe locally, merge into `dev` and push:**
   ```bash
   git checkout dev
   git merge feature/<feature-name>
   git push origin dev
   ```
   Only then is the module branch considered done (it may be deleted after
   merging if the user wants, but don't delete it unprompted).

5. **Before merging/pushing `dev` → `Master`, CI/CD must be checked first:**
   - This repo doesn't have GitHub Actions yet — the "CI/CD" being referred
     to right now is the **Vercel build**. After pushing `dev`, wait for /
     check the Vercel dashboard whether the deploy/preview for that `dev`
     commit **succeeded** (not red/failed) before proceeding to `Master`.
   - If GitHub Actions gets added later (`.github/workflows/*.yml`), check
     those status checks (`gh run list` / `gh pr checks`) before merging
     into `Master` — don't merge if any check is red.
   - A successful local build (`npm run build`) is NOT a substitute for
     checking CI/CD — that's only the minimum bar for getting into `dev`
     (step 3), not for getting into `Master`.

6. **Only push to `Master` after CI/CD on `dev` is green, and only if the user asks:**
   ```bash
   git push origin dev:Master
   ```
   (Fast-forward — `Master` should never have commits of its own outside
   what comes from `dev`. If the fast-forward fails / there's a divergence,
   STOP and report it to the user; never force-push.)

## Database environments & migrations

Each branch talks to its own Supabase project. The app picks the project
from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at **build time**.

| Branch / place | Supabase project | Where the keys live |
|---|---|---|
| Local dev (`.env.local`) | **staging** | `.env.local` (gitignored) |
| `dev` + PR previews | **staging** | Vercel env vars → *Preview* |
| `Master` | **production** | Vercel env vars → *Production* only |
| Android/iOS release build | **production** | `.env.production` on the build machine |

Production keys never go in `.env.local`, and real user data is never
copied into staging. Staging uses dummy data only.

Rules for any change to the database (tables, columns, constraints,
functions, RLS policies, triggers, storage buckets):

7. **Every DB change is a migration file in the repo.** Never change the
   schema by hand in the dashboard only.
   - Add `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` (full timestamp,
     so two migrations on the same day don't clash).
   - Write it to be re-runnable (`if not exists`, `drop … if exists` before
     `create`, `create or replace`) and additive where possible (add
     columns/tables; avoid dropping or renaming something the live app
     still reads).
   - Append the same SQL to the end of `supabase/staging-setup.sql` under a
     `-- ####` header with the file name, so a fresh staging project can
     still be set up in one run.
   - Mention the migration in the PR description.

8. **Run the migration on staging before (or at the same time as) the
   branch reaches `dev`.** `dev` deploys against the staging database, so
   code that needs a new column breaks on staging if the migration isn't
   there yet. Then check the `dev` deploy actually works on staging.

9. **Run the migration on production before pushing `dev` → `Master`.**
   Order: production migration first, then `git push origin dev:Master`.
   An additive migration is safe for the old code that is still live. If a
   migration is *not* backwards-compatible (drop/rename/new NOT NULL without
   a default), STOP and agree a plan with the user first, for example
   expand-then-contract over two releases.

10. **Claude cannot run SQL on Supabase from this repo.** When a change
    includes a migration, Claude must tell the user exactly which file to
    run, on which project (staging or production), and wait for the user to
    confirm it ran. Never report a migration as applied without that
    confirmation, and never push to `Master` while a production migration
    is still pending.

## Quick reference

| Stage | Branch | Requirement to proceed |
|---|---|---|
| Day-to-day feature work | `feature/<name>` | — |
| Feature considered safe | `feature/<name>` → `dev` | Local build passes (`npm run build`); new migrations run on **staging** |
| Ready for production | `dev` → `Master` | CI/CD (Vercel build from `dev`) is green; app checked on staging; new migrations run on **production** first |

Whenever unsure which stage is currently in play, ask the user rather than
assume — especially about whether it's already OK to push to `Master`.
