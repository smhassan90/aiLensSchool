# Academic Planner — progress

## Phase 3.1: Structured teaching assistance (verified)

| Area | Status |
|------|--------|
| Response schema | `TeachingHelpOutputSchema` (Zod) — sections A–G: overview, objectives, teacher explanation, classroom delivery, assessment, differentiation, source/confidence |
| Assistance modes | `PREPARE_LESSON` (default), `EXPLAIN_TOPIC`, `CREATE_QUESTIONS`, `CLASSROOM_ACTIVITY`, `DIFFERENTIATE` — validated in DTO; single pipeline + `modeInstruction()` |
| Lesson context | `resolveTeachingHelpContext()` + `PlannerContentService.loadChapterText()` for granted library chapters; anchor-based excerpt (max 6000 chars) |
| Basis | `CHAPTER_TEXT` (excerpt ≥80 chars), `OBJECTIVES_ONLY`, or `TEACHING_HELP_UNAVAILABLE` |
| AI provider | `FAST_AI_PROVIDER` (OpenAI when `OPENAI_API_KEY` set, else Cursor path); `generateTeachingHelp` with `response_format: json_object` (OpenAI), Zod validation, one bounded retry on invalid output |
| No silent AI fallback | Provider/validation failures return typed errors (`TEACHING_HELP_INVALID_OUTPUT`, `TEACHING_HELP_PROVIDER_ERROR`); heuristic only when provider is `mock`/`heuristic` (no API key) — labeled `aiGenerated: false` in API |
| Caching | `MemoryCacheService` key includes `schoolId`, `versionId`, `lessonKey`, `contentHash`, `basis`, `mode` · 24h |
| Rate limits | Nest `@Throttle` 10/min on endpoint + `TeachingHelpUsageService` per user/school window (`TEACHING_HELP_LIMIT_PER_MIN`, default 10) |
| In-flight dedup | `TeachingHelpUsageService.dedupeInFlight` prevents parallel duplicate generations |
| Output cap | OpenAI `TEACHING_HELP_MAX_OUTPUT_TOKENS` (default 4096) |
| AI logging | `AIRequestType.TEACHING_ASSISTANCE` with `metadata` `{ mode, lessonKey, versionId, basis, promptVersion }`; tokens/cost on success |
| Portal | `TeachingHelpDialog` — mode selector, optional question, Generate/Regenerate, sectioned results, copy, AI disclaimer; **Today’s lessons** + **planner workspace** lesson cards |
| Read-only | No planner/lesson/record persistence for generated help |
| DB mutations | **None** |

---

## Teaching help API

| Method | Path | Body |
|--------|------|------|
| POST | `/api/v1/academic-planners/:id/lessons/:lessonKey/teaching-help` | `{ versionId?, mode?, question? }` |

**Access:** Assigned teacher, planner owner, principal/admin, head teacher for the section. Planner lookup is scoped to the user’s school.

**Errors:** `TEACHING_HELP_UNAVAILABLE`, `TEACHING_HELP_RATE_LIMIT`, `TEACHING_HELP_INVALID_OUTPUT`, `TEACHING_HELP_PROVIDER_ERROR`, `PLANNER_FORBIDDEN`.

---

## Phase 2.1 recovery (unchanged)

Minimal-impact recovery, cross-section timetable conflicts, recovery UI — see git history.

---

## Tests executed (verified this session)

| Command | Result |
|---------|--------|
| `npx tsc --noEmit -p backend/tsconfig.json` | **PASS** |
| `npx jest teaching-help planner-teaching-help` | **18 passed** (7 suites) |
| `npm run build` (portal) | **PASS** |

Coverage highlights: Zod schema accept/reject, context resolution, excerpt bounds, usage rate limit + dedup, AI service cache key + invalid output, planner service auth/rate limit/unavailable/school scope, mode prompt strings.

---

## Known limitations / gaps

- **Integration tests:** Cross-school DB isolation and concurrent rate limiting are not verified by unit tests alone.
- **Mode in AI logs:** Mode is stored on `AIRequest.metadata`, not a dedicated column.
- **Portal UI tests:** No automated component tests for `TeachingHelpDialog`.
- **Cursor provider:** Output token cap env applies to OpenAI path; Cursor uses existing JSON timeout.
- Client cannot supply book/chapter IDs; content is always resolved server-side from the planner lesson.

---

## Database

No schema changes applied; no migrations, push, seed, or reset run.
