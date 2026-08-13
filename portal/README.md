# SMS Portal

Production-oriented Next.js 14 App Router frontend for the School Management System. Connects to the NestJS backend at `http://localhost:3001/api/v1`.

## Stack

- Next.js 14 (App Router, `src/`)
- React 18, TypeScript (strict)
- Tailwind CSS with teal/slate academic design tokens
- TanStack Query for server state
- React Hook Form + Zod for forms
- Hand-built UI components (shadcn-inspired, no CLI)

## Getting started

```bash
cp .env.example .env.local
npm install
npm run dev
```

Portal runs at [http://localhost:3000](http://localhost:3000). Ensure the backend is running on port 3001 with a seeded database.

## Seed credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@example.com` | `SuperAdmin123!` |
| School Admin | `admin@abcschool.com` | `SchoolAdmin123!` |
| Teacher | `teacher@abcschool.com` | `Teacher123!` |

## Route groups

| Portal | Base path | Login |
|--------|-----------|-------|
| Super Admin | `/super-admin/*` | `/super-admin/login` |
| School Admin | `/school/*` | `/login` |
| Teacher | `/teacher/*` | `/login` |

## Working flows

- Super admin login → dashboard stats (`GET /schools/dashboard/stats`)
- Create school with branch + admin (`POST /schools`)
- School admin login → students list/create with parent
- Teachers list/create
- Teacher: classes, manual lesson, review/confirm, quiz generate/publish

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint

## Environment

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` |
