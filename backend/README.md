# Firebase Cloud Messaging

Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the Firebase service-account JSON
(as a single-line environment variable). It is optional: notifications remain
available in-app when it is unset.

Quiz publish and homework creation send FCM notifications to active device
tokens for parents whose students have an active enrollment in the target
section. Parents can disable a notification type through
`NotificationPreference.pushEnabled`.
# SMS Backend

NestJS multi-tenant School Management + AI Learning API.

## Stack

- NestJS 10, Prisma 6, MySQL
- JWT auth + refresh tokens (bcrypt password hashing)
- BullMQ / Redis (optional — lesson AI processing falls back to inline)
- OpenAI (optional — deterministic mocks when `OPENAI_API_KEY` is empty)
- Local disk file storage when `STORAGE_ENDPOINT` is empty

## Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
npm run start:dev
```

API: `http://localhost:3001/api/v1`  
Swagger: `http://localhost:3001/api/docs`

## Seed accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@example.com` | `SuperAdmin123!` |
| School Admin | `admin@abcschool.com` | `SchoolAdmin123!` |
| Teacher | `teacher@abcschool.com` | `Teacher123!` |
| Parents | `parent1@example.com` (Ahmed, Ayesha, Ali), `parent2@example.com` (Ahmed) | `Parent123!` |

Seed also creates ABC School (MAIN + SECOND branches), Grade 5-A / 2-B / 1-A, Math/Science, a confirmed lesson, homework, a draft quiz, and a published quiz.

Pricing plan: **100 PKR / student**, **minimum 5000 PKR / month / branch** (`MAX(students*rate, min)`).

## Modules

`auth`, `users`, `schools`, `branches`, `students`, `parents`, `teachers`, `academics`, `lessons`, `homework`, `quizzes`, `results`, `attendance`, `announcements`, `events`, `notifications`, `billing`, `files`, `ai`, `audit`, `shop`

## Tests

```bash
npm test
npm run test:e2e   # requires DATABASE_URL + seed
```

## Key flows

1. Teacher creates/scans lesson → AI processing → review → confirm  
2. Teacher generates quiz from confirmed lessons → edit questions → **manual publish only**  
3. Parents list homework/quizzes/results/attendance for linked children only  
4. Super admin billing preview / invoice generation with per-branch fee breakdown  
