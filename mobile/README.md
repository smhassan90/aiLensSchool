# SMS Parent Mobile App

Expo React Native (TypeScript) parent app for the School Management System backend.

## Stack

- Expo SDK 52 · expo-router · TypeScript
- TanStack Query · React Hook Form + Zod
- expo-secure-store (tokens + selected child)
- expo-notifications (device token registration stub on login)

## Setup

```bash
cd mobile
cp .env.example .env
npm install
npm start
```

Ensure the backend is running at `http://localhost:3001/api/v1` (see `../backend/README.md`).

### Seed login

| Email | Password | Children |
|-------|----------|----------|
| `parent1@example.com` | `Parent123!` | Ahmed (5-A), Ayesha (2-B), Ali (1-A) |
| `parent2@example.com` | `Parent123!` | Ahmed (5-A) |

Login sends `expectedRole: PARENT` to `/auth/login`.

## Environment

| Variable | Default |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3001/api/v1` |

For Android emulator, use `http://10.0.2.2:3001/api/v1`.

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

Selected `studentId` is stored in secure storage and passed on every child-scoped API call (`homework`, `quizzes`, `attendance`, `results`). The backend verifies parent ownership — client selection is never trusted alone.

### Lessons

Parents call `GET /lessons?studentId=` — the backend verifies `StudentParent` ownership and only returns **CONFIRMED** lessons for the child's section.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Open Android |
| `npm run ios` | Open iOS simulator |
| `npm run web` | Web preview |

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Auth gate → login or home |
| `/login` | Parent login (RHF + Zod) |
| `/(tabs)/home` | Dashboard: lessons, homework, quizzes, events |
| `/(tabs)/diary` | Attendance + homework timeline |
| `/(tabs)/homework` | Homework list |
| `/(tabs)/quizzes` | Published quizzes |
| `/(tabs)/notifications` | Alerts with deep-link navigation |
| `/child-selector` | Switch linked child |
| `/lesson/[id]` | Lesson detail |
| `/homework/[id]` | Homework detail |
| `/quiz/[id]` | Quiz detail + result link |
| `/quiz/[id]/attempt` | Child attempt status |
| `/quiz/[id]/result` | Quiz result for selected child |
| `/announcement/[id]` | Announcement detail |
| `/event/[id]` | Event detail |
| `/profile` | Account + sign out |
| `/settings` | API URL info |
