# HawkNexa Parent Mobile App

Expo React Native (TypeScript) parent app for the School Management System backend.

## Stack

- Expo SDK ~57 · expo-router · TypeScript
- TanStack Query · React Hook Form + Zod
- expo-secure-store (tokens + selected child)

## Setup

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

Point `EXPO_PUBLIC_API_URL` at your API (local or hosted).

### Login

Parents sign in with the **username the school issued**, usually:

`schoolcode.phone` — e.g. `dtps.03001234567`

Password is the temporary password from the school (change it on first login when required).

Seeded demo schools (local seed only) may still use:

| Username / email | Password | Notes |
|------------------|----------|-------|
| `abc.f.stu001` / `parent1@example.com` | `Parent123!` | Only on freshly seeded local DB |

Login sends `expectedRole: PARENT` to `/auth/login`.

## Environment

| Variable | Default |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Hosted API in `app.config.ts`, or set in `.env` |

For Android emulator against a PC API: `http://10.0.2.2:3001/api/v1`.

## Deep links

Scheme: `smsparent://`

Examples:

- `smsparent://quiz/[id]`
- `smsparent://homework/[id]`
- `smsparent://lesson/[id]`
- `smsparent://event/[id]`
- `smsparent://announcement/[id]`

## Architecture

```
lib/           api client (401 refresh), auth helpers, secure storage
services/      API modules per domain
providers/     AuthProvider, ChildProvider, QueryProvider
app/           Expo Router screens
```

### Child context

Selected `studentId` is stored in secure storage and passed on every child-scoped API call. The backend verifies parent ownership.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Open Android |
| `npm run ios` | Open iOS simulator |
| `npm run web` | Web preview |
