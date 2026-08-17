# School Management + AI Learning SaaS

Multi-tenant school management platform with AI-powered lesson capture, quiz generation, and parent mobile access.

## Architecture

```
                    SCHOOL PLATFORM
                          |
         ┌────────────────┼────────────────┐
         |                |                |
    Portal            Portal            Mobile
  School Admin       Teacher            Parent
         |                |                |
         └────────────────┼────────────────┘
                          |
                     NestJS API
                          |
         ┌────────────────┼────────────────┐
         |                |                |
       MySQL            Redis          File Storage
                          |
                       BullMQ → AI / Notifications
```

## Projects

| Directory | Stack | Purpose |
|-----------|-------|---------|
| `backend/` | NestJS, Prisma, MySQL, Redis, BullMQ | Single API source of truth |
| `portal/` | Next.js 14, Tailwind, TanStack Query | School Admin, Teacher, Super Admin |
| `mobile/` | Expo, React Native | Parent app |

**Super Admin lives inside `portal/`** at `/super-admin/*` — not a separate project.

## Prerequisites

- Node.js 18+
- npm 9+
- Docker (optional, for MySQL + Redis)

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **MySQL 8** on `localhost:3306` (db: `sms`, user: `sms`, password: `smspassword`)
- **Redis 7** on `localhost:6379`

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

API: `http://localhost:3001/api/v1`  
Swagger: `http://localhost:3001/api/docs`

### 3. Portal

```bash
cd portal
cp .env.example .env.local
npm install
npm run dev
```

Portal: `http://localhost:3000`

### 4. Mobile

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

For Android emulator use `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api/v1`

## Development Credentials

| Role | Login URL | Email | Password |
|------|-----------|-------|----------|
| Super Admin | `/super-admin/login` | `superadmin@example.com` | `SuperAdmin123!` |
| School Admin | `/login` | `admin@abcschool.com` | `SchoolAdmin123!` |
| Teacher | `/login` | `teacher@abcschool.com` | `Teacher123!` |
| Parent (mobile) | app login | `parent1@example.com` | `Parent123!` |

Demo school: **ABC School** with Main Campus and Second Campus branches. `parent1@example.com` is linked to Ahmed, Ayesha, and Ali so child switching works.

## Core Flows

1. **Super Admin** → create school + branch + school admin
2. **School Admin** → create teachers, students, link parents
3. **Teacher** → record lesson (photo/manual) → AI processing → confirm → generate/publish quiz
4. **Parent (mobile)** → select child → view lessons, homework, quizzes, results
5. **Billing** → `MAX(active_students × rate, minimum_monthly_fee)` per branch

## CI/CD (GitHub → Vercel)

Pushing to `main` deploys **portal** and **backend** as separate Vercel projects. Pull requests get preview deployments. Only the app whose files changed is deployed.

### 1. GitHub secrets

In the GitHub repo: **Settings → Secrets and variables → Actions**. Add:

| Secret | Where to find it |
|--------|------------------|
| `VERCEL_TOKEN` | [Vercel account tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel team/org settings, or `.vercel/project.json` after `vercel link` |
| `VERCEL_PORTAL_PROJECT_ID` | Portal project → Settings → General → Project ID |
| `VERCEL_BACKEND_PROJECT_ID` | Backend project → Settings → General → Project ID |

App env vars (`DATABASE_URL`, `JWT_*`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, …) stay in each **Vercel project → Settings → Environment Variables**, not in GitHub.

### 2. Vercel project Root Directory

This repo is a monorepo. Next.js lives in `portal/package.json`, not at the repo root. In each Vercel project:

| Vercel project | Settings → General → Root Directory |
|----------------|-------------------------------------|
| Portal | `portal` |
| Backend | `backend` |

Leave **Include source files outside of the Root Directory** off unless a build truly needs files from another app.

GitHub Actions run from the **repo root** and use that Root Directory setting. If Root Directory is empty, Vercel looks at the repo root, finds no `next` dependency, and fails with "No Next.js version detected".

### 3. Avoid double deploys

If the GitHub repo is also connected in Vercel (**Project → Settings → Git**), turn off automatic Git deployments there. Otherwise every push deploys twice (Vercel Git + GitHub Actions).

You can also deploy manually: **Actions → Deploy to Vercel → Run workflow**.

## AI Configuration

Set `OPENAI_API_KEY` in `backend/.env` for real AI processing. Without it, the backend uses a deterministic dev mock — documented in `backend/README.md`.

## Testing

```bash
cd backend
npm test
npm run test:e2e
```

Critical tests: tenant isolation, role authorization, parent/teacher access boundaries, billing calculation.

## npm / corporate proxy

If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `403 Forbidden`, your network is intercepting TLS to the npm registry. Use your IT-provided CA, or temporarily:

```bash
npm config set strict-ssl false
```

Then re-run `npm install` in `backend`, `portal`, and `mobile`.

## API Versioning

All endpoints use prefix `/api/v1/`.

## License

Private — UNLICENSED
# aiLensSchool
