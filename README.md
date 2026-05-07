# usa-errands-web

Next.js 14 (App Router) marketing site, vendor portal, and admin portal for USA Errands.

Companion repo: [`usa-errands-api`](../usa-errands-api/) — NestJS REST API.

## Stack

- Next.js 14, React 18, TypeScript 5.6 (strict, `noUncheckedIndexedAccess`)
- Tailwind CSS — locked to the v1.0 Design System tokens (`tailwind.config.ts`)
- react-hook-form + Zod (schemas mirrored from the API)
- TanStack Query v5 for server state (P1+)
- Lucide icons

## Prerequisites

- Node.js >= 20.11
- pnpm or npm
- The API running locally on `:4000` (see `../usa-errands-api/README.md`)

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routing (P0)

Currently shipped:

- `/` — marketing home (LEDGR-style hero + dashboard preview + stats bar)
- `/login` — email + password (form is wired to `POST /v1/auth/login`)

Scaffolded for P0+ as auth completes:

- `/signup`, `/signup/verify-email`, `/signup/2fa-enroll`, `/signup/kyc`, `/signup/agreement`
- `/login/2fa`, `/login/recovery`
- `/forgot-password`, `/reset-password`

P1+ adds the full portal under `(portal)/...` per Implementation Plan §7.4.

## Design system

The visual language is locked. Tokens live in two places that **must stay in sync**:

1. `tailwind.config.ts` — Tailwind utility names (`bg-cream`, `text-amber`, `font-mono`)
2. `src/styles/globals.css` — CSS custom properties (for non-Tailwind usage)

Open the live design system reference in `../USA_Errands_Design_System.html` to see every component in context.

Components live in `src/components/ui/` (Button, Input, Field) and conform strictly to the tokens. New primitives must read tokens via Tailwind classes — no inline styles, no custom hex values.

## Security posture

- HSTS preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, locked Permissions-Policy (in `next.config.mjs`)
- Tokens never persisted in `localStorage`. Access token lives in memory; refresh token is an `httpOnly` cookie set by the API.
- All forms validate client-side via Zod schemas mirrored from the backend. Server is the source of truth — UI gating is a UX nicety, not a security boundary.
- No `dangerouslySetInnerHTML` permitted in the codebase. ESLint rule planned in P0.9.

## Scripts

| Command          | What it does                  |
| ---------------- | ----------------------------- |
| `pnpm dev`       | Next dev server on :3000      |
| `pnpm build`     | Production build              |
| `pnpm start`     | Production runtime            |
| `pnpm typecheck` | `tsc --noEmit`                |
| `pnpm lint`      | next lint                     |
| `pnpm test`      | Vitest                        |

## What's NOT here yet

- Vendor portal pages — P1.
- Admin portal pages — P1+.
- TanStack Query provider — added when first portal data dependency lands.
- Storybook — added in P0.9.
- e2e (Playwright) — added in P0.9.

This is the foundation. P1 starts the moment auth is verified end-to-end against the API.
