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
- **MySQL 8** on `localhost:3306` (db: `school_management`, user: `sms`, password: `smspassword`)
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

## Environment Variables

See `.env.example` in each project:

- `backend/.env.example` — database, JWT, Redis, AI, storage, CORS
- `portal/.env.example` — `NEXT_PUBLIC_API_URL`
- `mobile/.env.example` — `EXPO_PUBLIC_API_URL`

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
