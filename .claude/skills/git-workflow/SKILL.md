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
module/<module-name>   ← day-to-day work per feature/module, start here
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
   git checkout -b module/<module-name>
   ```
   Branch names use `module/<module-name>` (e.g. `module/multi-currency`,
   `module/live-rate`). One branch = one module/feature — don't mix
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
   git merge module/<module-name>
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

## Quick reference

| Stage | Branch | Requirement to proceed |
|---|---|---|
| Day-to-day feature work | `module/<name>` | — |
| Module considered safe | `module/<name>` → `dev` | Local build passes (`npm run build`) |
| Ready for production | `dev` → `Master` | CI/CD (Vercel build from `dev`) is green |

Whenever unsure which stage is currently in play, ask the user rather than
assume — especially about whether it's already OK to push to `Master`.
