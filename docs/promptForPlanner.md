HawkNexa — Composer 2.5 Implementation Master Prompt
You are implementing the Smart Academic Planner and Classroom Monitoring system in the existing HawkNexa monorepo at D:\workspace\aiLensSchool\aiLensSchool (Windows, PowerShell). Everything below was verified against the codebase. Where the prompt states a fact about existing code, re-check it in Phase 0 before relying on it. Where it prescribes a design, implement that design. Do not substitute an alternative unless you find evidence in the code that the prescribed design cannot work. In that case stop, record the evidence in the progress file, and pick the smallest compatible adjustment.

0. Non-negotiable operating rules
0.1 Repository safety
Run git status before your first edit. These files contain the user's uncommitted work. Do not edit, reformat, stage, revert or delete them:
backend/src/lessons/lessons.service.ts
backend/test-fixtures/fractions-teacher-upload/*.jpg
deploy/hawknexa/Caddyfile
deploy/hawknexa/deploy-backend-only.sh
deploy/hawknexa/docker-compose.prod.yml
deploy/hawknexa/install-pix2text-venv.sh
deploy/hawknexa/upsert-ocr-env-on-vps.sh
docs/OCR_OPERATIONS.md
The untracked files are also off-limits: backend/scripts/_*.ts, backend/scripts/compile-*-chapters.ts, debug-*, backend/eng.traineddata, __pycache__.
Never run git reset, git checkout -- <file>, git clean, git stash, git push, or force operations. Do not commit unless the user asks. Never push: pushes to main auto-deploy through .github/workflows/deploy-hawknexa-vps.yml and deploy/hawknexa/deploy.sh.
Do not read, print, copy or log secrets. This includes .env values, firebase-admin-key.json and API keys. Never hardcode provider credentials; read them through readEnv/requireEnv in backend/src/common/env.ts.
0.2 Database safety (critical)
backend/.env sets DATABASE_URL to a remote MySQL host (66.135.60.203:3308/sms). Treat it as production.

Forbidden against that URL: prisma db push, prisma migrate *, prisma db seed, npm run prisma:seed, npm run test:e2e, any script that writes to the database, and prisma studio.

You may only run database-touching commands after explicitly setting DATABASE_URL in the same PowerShell command to a local database whose host is localhost, 127.0.0.1 or mysql and whose database name contains test. Example:

$env:DATABASE_URL="mysql://sms:smspassword@localhost:3306/sms_planner_test"; npx prisma db push --skip-generate
If no local MySQL is available, skip database-backed steps and report them as not run.

Never use prisma migrate dev or prisma migrate reset. backend/prisma/migrations/ has only four migrations and does not match the schema, because deploys use npx prisma db push --skip-generate from backend/docker-entrypoint.sh. Running migrate would detect drift and propose a reset.

Never use --accept-data-loss or --force-reset.

Schema-only commands that are always safe: npx prisma format, npx prisma validate, npx prisma generate.

portal/.env.local sets NEXT_PUBLIC_USE_LOCAL_API=false and points at https://hawknexabackend.fynals.com/api/v1, which is production. Before any manual browser testing, set NEXT_PUBLIC_USE_LOCAL_API=true and NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 in your shell session. Do not edit .env.local. Never create test data through the production API.

0.3 Engineering rules
Do not rewrite HawkNexa, change frameworks, or replace authentication.
Do not add microservices, queues, new state libraries, extra databases, or a drag-and-drop library.
BullMQ is optional in this repo: backend/src/queues/queues-enabled.ts disables it without Redis and on serverless hosts. No feature may depend on queues.
Do not invent filenames, tables, APIs, hooks or components beyond those prescribed here. If you need a filename this prompt does not give, follow the naming convention of the target directory (kebab-case *.service.ts, *.controller.ts, *.module.ts, dto/*.dto.ts, *.spec.ts).
Build business logic first. Do not build mocked UI ahead of working APIs.
Implement the phases in order (§18). Each phase must compile and pass its tests before you start the next.
Never claim a test, typecheck, lint or build passed unless you ran it in this session and saw it pass. Report anything you did not run as NOT RUN, with the reason.
0.4 Progress record
Create and keep updating docs/ACADEMIC_PLANNER_PROGRESS.md (the user explicitly asked for this file). After each phase, and before you run out of context, record:

completed phases;
files created and modified;
commands run, with pass/fail;
open issues;
remaining tasks;
the next precise action, naming the file and function.
If you resume from a previous session, read this file first.

0.5 Product invariants
The timetable, approved planner, daily teaching records and classroom observations are four separate data sets. Never infer one from another.

A scheduled lesson is never assumed taught.
Teachers never upload lesson material. Content comes only from the centrally managed library.
AI never changes the approved planner, never marks lessons complete, never enforces scheduling or authorization rules, and never claims to have analysed content it was not given.
The exam date is never changed silently. Content is never dropped silently. Subsequent lessons are never shifted blindly.
Unreviewed OCR or AI timetable output is never published.
If the timetable or approved planner lacks data, show "No planned lesson" and never invent one.
1. Verified architecture (actual paths)
1.1 Monorepo layout
backend/
Stack: NestJS 10, Prisma 5.22, MySQL 8, class-validator DTOs, zod for AI output, jest + ts-jest + supertest, pino.
Entry points: src/main.ts, src/configure-app.ts, src/app.module.ts.
portal/
Stack: Next.js 14.2 app router, React 18, TanStack Query 5, Tailwind, react-hook-form, zod, lucide-react.
UI primitives are hand-rolled.
mobile/: Expo app for parents only (expectedRole: 'PARENT'). It is not in scope; mobile classroom rounds are delivered as responsive portal pages.
shared/: empty. Do not use it.
1.2 Request pipeline (backend/src/configure-app.ts, backend/src/app.module.ts)
Routing and validation

Global prefix api with URI versioning v1, so routes are /api/v1/<controller path>.
Global ValidationPipe({ whitelist, forbidNonWhitelisted, transform }). Every body field must be declared in a DTO. Nested arrays need @ValidateNested({ each: true }) and @Type(() => X).
Response and error envelopes

TransformInterceptor wraps every response as { success: true, data }.
common/filters/all-exceptions.filter.ts and exception-logs/exception-log.service.ts (parseException) return { success: false, error: { code, message, details? } }.
Throw errors as new XException({ code, message }).
To return structured details, you must throw new ConflictException({ error: { code, message, details } }). parseException keeps nested error.details. Otherwise it puts body.message into details.
Global guards (in order)

ThrottlerGuard
JwtAuthGuard (auth/strategies/jwt.strategy.ts, user cached for 120s)
RolesGuard (common/guards/roles.guard.ts): @Roles(...). PRINCIPAL satisfies SCHOOL_ADMIN.
PermissionsGuard (common/guards/permissions.guard.ts): @RequirePermission(...). Throws MISSING_PERMISSION. SUPER_ADMIN and SCHOOL_ADMIN have every permission.
Use @CurrentUser() user: AuthUser (common/types/auth-user.type.ts: { id, email, schoolId, roles, permissions }) and @Public() where appropriate.

Permissions

Defined in backend/src/common/permissions.ts: STAFF_PERMISSIONS, PRINCIPAL_DEFAULT_PERMISSIONS, parsePermissions, hasStaffPermission.
The portal mirror is StaffPermission in portal/src/lib/types.ts.
This feature adds no new permission keys.
Tenancy

common/services/tenant.service.ts (Global via common/common.module.ts) provides requireSchoolId, assertSchoolAccess, assertOwnedOrThrow, isTeacher, isSchoolAdmin, isSchoolStaff.
Every query must include schoolId.
HTTP GET cache

common/interceptors/http-cache.interceptor.ts caches GETs for 60s under the key http:${schoolId}:${userId}:${url}.
Any POST, PUT, PATCH or DELETE invalidates the whole school's cache.
The skip list is in that file. Time-sensitive endpoints must be added to it (§4).
Prisma

database/prisma.service.ts (PrismaService): interactive transactions with maxWait 15s and timeout 60s.
There is no optimistic-locking pattern anywhere in the repo. This feature introduces one (§11).
1.3 Domain facts (backend/prisma/schema.prisma, 2663 lines)
Roles and staff types

RoleName values: SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, TEACHER, PARENT, STUDENT.
Head teacher is not a role. A head teacher is a TeacherProfile with a HeadTeacherAssignment (teacherId unique) and HeadTeacherSection rows (sectionId unique). Helpers: resolveHeadTeacherSectionIds(prisma, schoolId, userId) and teacherHeadsSection(...) in backend/src/head-teachers/head-teacher-sections.ts, and HeadTeachersService.assertHeadTeacher (throws HEAD_TEACHER_REQUIRED).
Principal is a User with role PRINCIPAL (created by UsersService.createStaff). It has no TeacherProfile and uses /school/* through SchoolAdminGuard (["SCHOOL_ADMIN","PRINCIPAL"]).
Academic structure

Weekday enum is MONDAY to FRIDAY only. Do not extend it.
AcademicYear: isCurrent, startDate and endDate as @db.Date.
Grade.hasPeriodTimetable is false for pre-primary grades, which use a class-teacher pattern.
Section: branchId, gradeId, classTeacherId.
Subject: @@unique([schoolId, code]).
ClassSubject: sectionId, subjectId, teacherId?, assistantTeacherId?, academicYearId, @@unique([sectionId, subjectId, academicYearId]).
Timetable (current state)

TimetableSlot (timetable_slots) is unversioned: @@unique([sectionId, academicYearId, weekday, periodNumber]), startTime/endTime as VarChar(8)?.
Its only writers are backend/scripts/store-tps-preprimary.ts and backend/scripts/clone-tps-to-demo.ts.
The only reader is AcademicsService.listTimetable(user, gradeId) in backend/src/academics/academics.service.ts (~lines 1270–1365), exposed as GET /academics/timetable (SCHOOL_ADMIN, TEACHER). It uses the current academic year and the first section of the grade, and returns pattern: 'WEEKLY' | 'CLASS_TEACHER'.
Content library

LibraryBook is global and super-admin managed. It has catalogKey (unique) and free-text classLabel, subjectLabel, language.
LibraryBookChapter: bookId, chapterNumber?, title, topicName, publishedText LongText, exercisesText LongText, @@unique([bookId, title]).
LibraryBookGrant: bookId, schoolId, canRead, canWrite, canUpdate, canDelete, @@unique([bookId, schoolId]).
backend/src/library-books/library-books.service.ts and .controller.ts are @Roles(SUPER_ADMIN) only.
replaceChapter edits content.
removeChapter hard-deletes chapters (libraryBookChapter.delete).
assertSchoolCanUseLessons blocks new artifacts when a grant is missing.
There is no school-facing read endpoint.
Curriculum/Chapter/Topic/Concept are effectively unused. Do not use them.
Teacher-owned DailyLesson rows with recordKind: CHAPTER_LIBRARY are not a planner content source.
Daily lessons

DailyLesson uses recordKind (CHAPTER_LIBRARY | CLASS_SESSION) and sessionType (NEW_LESSON, CONTINUATION, REVISION). chapterSourceId must point at a teacher-owned CHAPTER_LIBRARY row.
The existing "today in class" flow is portal/src/app/(teacher)/teacher/lessons/today/page.tsx with components/lessons/today-in-class-form.tsx, backed by LessonsService.createClassSession. Leave it unchanged.
Calendar, attendance, notifications, files, AI logging

Event: type EventType (includes HOLIDAY and EXAM), startDate/endDate DateTime, audience (ALL_SCHOOL, BRANCH, GRADE, SECTION), plus branchId?, gradeId?, sectionId?. Managed by backend/src/events/.
TeacherAttendance: @@unique([teacherId, date]), status, checkedInAt.
Notification / NotificationType: NotificationService.createAndQueue and createForUsers(userIds, input) in backend/src/notifications/notifications.service.ts. These persist rows and send FCM push when configured. The portal has no notification inbox.
FileAsset: FilesService.saveSchoolUpload(schoolId, uploadedById, file, folder) in backend/src/files/files.service.ts stores under schools/${schoolId}/${folder}. Local storage serves /uploads/<uuid key> publicly (files/local-storage.service.ts, static route in configure-app.ts). The service throws REMOTE_STORAGE_NOT_WIRED when STORAGE_ENDPOINT is set.
AIRequest: type AIRequestType, provider, model, tokens, cost, status, metadata. AIRequestType values: LESSON_PROCESSING, LESSON_SUMMARY, QUIZ_GENERATION, QUESTION_GENERATION, QUESTION_REGENERATION, HOMEWORK_GENERATION, STUDENT_ANALYSIS. PlatformService.purgeData deletes AIRequest rows by date range, so never add a foreign key to AIRequest.
Settings, exams, audit

SchoolSettings.timezone defaults to "Asia/Karachi".
Timezone helpers in backend/src/teachers/teacher-checkin.ts: DEFAULT_SCHOOL_TIMEZONE, hmToMinutes, normalizeHm, zonedMinutes(date, tz), zonedDateIso(date, tz), dateFromIso(iso) (returns UTC midnight, for @db.Date), loadTeacherAttendancePolicy.
ExamConfig: academicYearId, name (free text such as "1st Assessment", "Mid term", "Final Term" from academics/exam-patterns.ts), sequence, startDate?, endDate?. Managed by AcademicsService.listExamConfigs / setExamConfigDate.
AuditService.log({ actorUserId, schoolId, branchId, action, entityType, entityId, metadata }) in backend/src/audit/audit.service.ts is fire-and-forget and runs outside transactions.
1.4 Reusable patterns to copy
Approval pattern: backend/src/quizzes/quizzes.service.ts (submitForPrint, approvePaper, rejectPaper). It uses status checks, a mandatory rejection reason, reviewedById/reviewedAt, and audit actions like EXAM_PAPER_APPROVED. It has no compare-and-set; you add that.
AI service pattern: backend/src/ai/services/chapter-compile.service.ts and quiz-generation.service.ts.
Create an AIRequest with status PROCESSING.
Call the provider.
Update the request to COMPLETED with tokens and metadata, or to FAILED with the error.
On failure throw BadGatewayException({ code, message }).
AI provider layer: ai/ai.module.ts registers CursorProvider, OpenAiProvider, and the factories AI_PROVIDER and FAST_AI_PROVIDER. FAST_AI_PROVIDER prefers OpenAI JSON mode when OPENAI_API_KEY is set.
ai/providers/ai.provider.ts defines AiProvider and AiCompletionResult<T>{ data, provider, model, inputTokens, outputTokens, estimatedCost }.
openai.provider.ts has private chat(system, user, images) (json_object, temperature 0.2) and deterministic mocks when no key is set.
cursor.provider.ts has private complete(system, user), withTimeout, and jsonTimeoutMs (40s, 28s on serverless). It reports zero tokens.
AI parsing: ai/parse-model-json.ts (parseModelJson); zod schemas in ai/schemas/*.schema.ts; joinCompiledChapter in ai/schemas/chapter-compile.schema.ts; prompts in ai/prompts/index.ts.
OCR: backend/src/lessons/page-ocr.service.ts (PageOcrService.readPageTexts, Tesseract pool). It returns empty results on serverless. LessonsModule (lessons/lessons.module.ts) provides it but does not export it.
Teacher context: TeachersService.myClasses (GET /teachers/me/classes); LessonsService.requireTeacherProfile; the private assertTeacherAssignment precedence (ClassSubject teacher or assistant, then class teacher, then head teacher).
Utilities:
common/utils/person-name.ts: teacherDisplayName gives "Sir X" / "Miss X".
common/utils/section-class-label.ts: parseClassNumber, sectionClassLabel, gradeClassLabel.
lessons/ocr-subject-lang.ts: ocrLanguagesForSubject detects Urdu, Arabic and Islamiat.
homework/homework-questions.ts: isMathSubject also returns true for science. Do not reuse it for subject profiles.
MemoryCacheService is Global in common/common.module.ts.
Unit test style: backend/src/parents/day-off.service.spec.ts builds the service with jest.fn() prisma and tenant mocks.
E2E style: backend/test/app.e2e-spec.ts (skipped without DATABASE_URL) with backend/test/jest-e2e.json.
Portal
src/lib/api-client.ts: apiClient<T>(path, { timeoutMs }), apiForm, apiUpload, buildQuery, ApiClientError(message, status, code). details is currently dropped.
src/lib/display-labels.ts: API_ERROR_MESSAGES, friendlyApiErrorMessage.
src/providers/auth-provider.tsx: useAuth() with user, can, hasAnyRole.
src/providers/toast-provider.tsx: useToast.
src/components/ui/{button,dialog,tabs,card,table,select,input,label,textarea,badge,skeleton}.tsx (Dialog is bottom-aligned on mobile).
src/components/layout/{page-header,page-loader,empty-state,ai-wait,app-shell,teacher-sidebar,school-sidebar}.tsx.
src/components/auth/auth-guard.tsx: SchoolAdminGuard, TeacherGuard.
Services are object literals in src/services/*.service.ts that export their own types (see head-teachers.service.ts, academics.service.ts).
1.5 Features that do not exist (do not assume them)
No PDF or XLSX parser in backend or portal.
No drag-and-drop library.
No portal notification inbox.
No optimistic locking.
No working-Saturday or calendar-exception concept.
No versioned timetable and no timetable upload.
No school-facing library read API.
No staff mobile app.
No portal test framework (no jest, vitest or playwright in portal/package.json).
Backend npm run lint cannot run: eslint is not installed and there is no config. Do not add eslint; report it as not runnable.
Backend typecheck: npx tsc --noEmit -p tsconfig.json (strict, includes prisma/**).
Portal: npm run lint (next lint, .eslintrc.json present) and npm run build.
2. Components and services to reuse (do not duplicate)
Need	Reuse
Tenant and school scoping
TenantService
Head-teacher scope
resolveHeadTeacherSectionIds, teacherHeadsSection
Timezone and date math
teacher-checkin.ts helpers; SchoolSettings.timezone
Holidays
Event rows with type = HOLIDAY (read-only use)
File storage
FilesService.saveSchoolUpload(..., 'timetables')
OCR for images
PageOcrService.readPageTexts (export it from LessonsModule)
AI calls, JSON parsing, logging
FAST_AI_PROVIDER, parseModelJson, zod, AIRequest pattern
Chapter text
LibraryBookChapter.publishedText + exercisesText via joinCompiledChapter
Audit
AuditService.log
Notifications
NotificationService.createForUsers
Teacher identity
TeacherProfile lookup by userId and schoolId
Display names
teacherDisplayName, sectionClassLabel
Caching AI teaching help
MemoryCacheService
Portal API, toasts, auth, UI
apiClient, apiForm, useToast, useAuth, components/ui/*, layout components
3. Architecture decisions (final)
D1. Content source. LibraryBookChapter is the only planner content source, read through a school grant with LibraryBookGrant.canRead = true.

The planner stores libraryBookId.
Each PlannerChapter stores a nullable FK to LibraryBookChapter (onDelete: SetNull), a titleSnapshot, and a contentHash (sha256 of the joined text). Chapters can be edited or hard-deleted by super admins.
Books are matched to subjects and grades only by suggestion: case-insensitive comparison of classLabel/subjectLabel with the section's class label and the subject name. The user always confirms the book. There is no FK between books and subjects.
D2. New modules. Use flat files, following the current module convention.

backend/src/timetables/ (TimetablesModule): school calendar, timetable versions, import, validation, resolver.
backend/src/academic-planner/ (AcademicPlannerModule): planners, versions, schedule engine, approval, teaching records, recovery, classroom rounds, observations, reports.
AI pieces go in the existing backend/src/ai/.
Pure domain logic lives in framework-free .ts files with .spec.ts siblings.
D3. Calendar.

Monday to Friday are working days by default.
Event rows with type = HOLIDAY are non-working at their audience scope.
A new SchoolCalendarDay table stores explicit NON_WORKING or WORKING overrides at ALL, GRADE or SECTION scope.
Working weekend days need followsWeekday, because Weekday is Monday to Friday only.
Precedence: the most specific scope wins. At equal specificity, SchoolCalendarDay beats Event.
D4. Timetable versioning. New tables TimetableImport, TimetableVersion (per section) and TimetablePeriod.

Effective dating is append-only.
When a section has no versions, the resolver falls back to legacy TimetableSlot.
listTimetable switches to the resolver with the same response shape. There is no dual-write to TimetableSlot.
D5. Upload formats.

Supported now: CSV (deterministic parser for the data/*.csv grid format), JPEG/PNG/WebP images (OCR plus AI vision or text extraction, then mandatory human review), and manual grid entry.
XLSX and PDF are rejected with UNSUPPORTED_TIMETABLE_FORMAT. The message tells the user to save as CSV or upload a screenshot. Reason: the repo has no parser for these, and adding binary-format libraries is unjustified infrastructure for this delivery. Record this as a follow-up.
D6. Planner model.

AcademicPlanner is the identity record. It holds pointers approvedVersionId (the official version) and workingVersionId (at most one non-final version), plus lockRevision.
AcademicPlannerVersion is an immutable snapshot once it leaves DRAFT or CHANGES_REQUESTED.
PlannerChapter, PlannerActivity and PlannerLesson belong to a version.
Schedule-recovery requests are versions with origin = RECOVERY, so there is one approval pipeline.
D7. Concurrency.

Each version has a revision Int. Every edit carries expectedRevision and compare-and-sets the revision with updateMany({ where: { id, revision, status in editable } }) inside $transaction.
Decisions compare-and-set the version status and the planner's lockRevision.
Planner creation serialises on the ClassSubject row using SELECT ... FOR UPDATE.
D8. Scheduling is deterministic code (schedule-engine.ts, recovery-engine.ts). AI only supplies validated chapter analyses (portions, stages, minute estimates, objectives, activity suggestions).

D9. Teaching records. A new TeachingRecord table, unique per (plannerId, date, periodNumber). It is separate from DailyLesson CLASS_SESSION, whose chapterSourceId semantics are incompatible. Records are never changed by planner version changes.

D10. Classroom rounds. Delivered as responsive, mobile-first portal pages. They are computed live, excluded from the HTTP cache, and accept an ?at= override for testing.

D11. Notifications. Persisted through NotificationService.createForUsers with new NotificationType values. The portal shows pending counts on its approval and list pages. Do not build a notification inbox.

D12. Actor columns are plain strings, without foreign keys. This covers createdById, submittedById, decidedById, publishedById, observerUserId, recordedById and approval-event actors. History survives user removal, and adding a dozen back-relations to User is avoided. Validate these values in code. Tenant and ownership references do use foreign keys.

D13. Delete rules.

Required tenant FKs (school, section, subject, teacher, academic year, planner, version): onDelete: Cascade. This matches TimetableSlot and ClassSubject and keeps the school deletion in backend/scripts/clone-tps-to-demo.ts working. The app never hard-deletes teachers, sections or subjects.
Optional FKs: SetNull.
TeachingRecord.planner uses Cascade, but the service forbids deleting any planner that has records or was ever submitted.
4. File-by-file instructions
4.1 Backend: new files
backend/src/timetables/

File	Responsibility
timetables.module.ts
Imports LessonsModule (for PageOcrService), FilesModule, AiModule, AuditModule, NotificationsModule (check these module names in app.module.ts). Exports TimetableResolverService and SchoolCalendarService. Must not import AcademicsModule (avoids a dependency cycle).
school-calendar.ts
Pure working-day resolution (§10.1).
school-calendar.service.ts
Loads SchoolCalendarDay, HOLIDAY Event rows and the timezone. CRUD for calendar days. workingDays(schoolId, sectionId, fromIso, toIso).
school-calendar.controller.ts
Routes /academic-calendar/*.
timetable-csv.ts
Pure CSV grid parser (§12.2).
timetable-matching.ts
Pure matching of subjects, teachers and classes: honorific stripping, aliases, ambiguity detection.
timetable-validation.ts
Pure validation (§12.4).
timetable-resolver.service.ts
periodsFor(schoolId, sectionId, dateIso), periodsForRange(...), teachingSlotsFor(...), effectiveVersion(...). Falls back to legacy TimetableSlot.
timetable-imports.service.ts
Upload, extraction, re-extraction and discard of imports.
timetable-versions.service.ts
Drafts, period replacement, validation, publishing, legacy adoption, cloning.
timetables.controller.ts
Routes /timetables/*.
dto/timetable.dto.ts, dto/school-calendar.dto.ts
DTOs.
*.spec.ts siblings
Tests for each pure file and for the services.
backend/src/academic-planner/

File	Responsibility
academic-planner.module.ts
Imports TimetablesModule, AiModule, LibraryBooksModule, AuditModule, NotificationsModule.
planner-types.ts
Shared TypeScript types (§7.1).
planner-status.ts
Pure state machine: allowed transitions, editability, who may act.
subject-profiles.ts
Pure subject-profile detection and provisional heuristics (§8.4).
schedule-engine.ts
Pure slot generation, segment building, packing, reflow, moves, dependency validation, feasibility (§9).
recovery-engine.ts
Pure recovery proposal and impact diff (§14).
progress-metrics.ts
Pure due, completed, partial, missed, unreported, adherence, forecast and risk calculations (§16).
rounds-resolver.ts
Pure current-period resolution (§12.1 of behaviour; §13 below).
planner-access.service.ts
Actor resolution and every authorization check (§16).
planner-content.service.ts
Granted books, chapter list, chapter text loading, content hashing, change detection.
academic-planners.service.ts
Create, list, get, payload assembly, chapter, activity and lesson edits, generation.
planner-approval.service.ts
Submit, withdraw, approve, reject, request changes, direct publish, revisions, archive, complete.
planner-recovery.service.ts
Recovery proposals.
teaching-records.service.ts
My-day view, upsert records, list records.
classroom-rounds.service.ts
Live rounds, observations, follow-ups.
planner-reports.service.ts
Overview and per-planner progress.
academic-planners.controller.ts
/academic-planners/*
classroom-rounds.controller.ts
/classroom-rounds/*
planner-reports.controller.ts
/planner-reports/*
dto/planner.dto.ts, dto/planner-edit.dto.ts, dto/teaching-record.dto.ts, dto/observation.dto.ts
DTOs.
Specs
planner-status.spec.ts, schedule-engine.spec.ts, recovery-engine.spec.ts, progress-metrics.spec.ts, rounds-resolver.spec.ts, subject-profiles.spec.ts, planner-access.service.spec.ts, planner-approval.service.spec.ts, teaching-records.service.spec.ts, classroom-rounds.service.spec.ts.
backend/src/ai/

File	Responsibility
schemas/planner-chapter-analysis.schema.ts
Zod schema for chapter analysis output, plus a .spec.ts.
schemas/teaching-help.schema.ts
Zod schema for teaching help output.
schemas/timetable-extraction.schema.ts
Zod schema for timetable extraction output.
services/planner-chapter-analysis.service.ts
Chapter analysis calls.
services/teaching-help.service.ts
Teaching help calls.
services/timetable-extraction.service.ts
Timetable extraction calls.
backend/test/

academic-planner.e2e-spec.ts
support/safe-test-database.ts: exports assertSafeTestDatabase(). It throws unless the DATABASE_URL host is localhost, 127.0.0.1 or mysql and the database name contains test.
4.2 Backend: modified files (minimal, additive)
backend/prisma/schema.prisma: add enums and models (§5), add enum values to NotificationType and AIRequestType, and add back-relation array fields on School, AcademicYear, Section, Subject, TeacherProfile, LibraryBook, LibraryBookChapter, ExamConfig, FileAsset.
backend/src/app.module.ts: import TimetablesModule and AcademicPlannerModule.
backend/src/lessons/lessons.module.ts: add PageOcrService to exports. This is the only lessons-area change; do not touch lessons.service.ts.
backend/src/academics/academics.module.ts: import TimetablesModule.
backend/src/academics/academics.service.ts: in listTimetable only, take slots from TimetableResolverService.periodsFor(...). Accept an optional sectionId query parameter, defaulting to the current first-section behaviour. Return the identical shape, plus optional sectionId, versionId, source: 'VERSIONED' | 'LEGACY' | 'NONE' and sections (the grade's sections). Change nothing else in this 3384-line file.
backend/src/academics/academics.controller.ts: pass the optional sectionId query to listTimetable.
backend/src/library-books/library-books.service.ts: add listGrantedBooksForSchool(schoolId) and getGrantedChapterForSchool(schoolId, chapterId). Both check canRead. Do not call the private ensureTables() (db push manages tables). Do not change existing methods.
backend/src/ai/providers/ai.provider.ts: add three methods to AiProvider: analyzePlannerChapter, generateTeachingHelp, extractTimetable (§8).
backend/src/ai/providers/openai.provider.ts and cursor.provider.ts: implement the three methods, each with a deterministic mock used when no key is configured. In cursor.provider.ts, add an optional timeoutMs parameter to the private complete() (defaulting to the current jsonTimeoutMs).
backend/src/ai/prompts/index.ts: add PLANNER_CHAPTER_ANALYSIS_SYSTEM_PROMPT, TEACHING_HELP_SYSTEM_PROMPT, TIMETABLE_EXTRACTION_SYSTEM_PROMPT and a PLANNER_PROMPT_VERSION = 'planner-analysis-v1' constant.
backend/src/ai/ai.module.ts: provide and export the three new services.
backend/src/common/interceptors/http-cache.interceptor.ts: add /classroom-rounds and /academic-planners/my-day to the skip list.
4.3 Portal: new files
Services

portal/src/services/academic-planner.service.ts
portal/src/services/timetables.service.ts
portal/src/services/classroom-rounds.service.ts
portal/src/lib/planner-view-model.ts: pure selectors that build the calendar, timeline and outline view models from a single payload.

portal/src/components/planner/

planner-create-form.tsx
planner-workspace.tsx
planner-status-banner.tsx
planner-calendar-view.tsx
planner-timeline-view.tsx
planner-outline-view.tsx
lesson-card.tsx
move-lesson-dialog.tsx
lesson-edit-dialog.tsx
chapter-activities-panel.tsx
approval-actions.tsx
version-history.tsx
recovery-diff-table.tsx
teaching-record-dialog.tsx
teaching-help-dialog.tsx
today-lessons-list.tsx
portal/src/components/classroom-rounds/

rounds-board.tsx
round-class-card.tsx
observation-sheet.tsx
portal/src/components/timetable/

timetable-upload-card.tsx
timetable-grid-editor.tsx
timetable-issues-panel.tsx
timetable-publish-dialog.tsx
Teacher pages (portal/src/app/(teacher)/teacher/)

planner/page.tsx
planner/new/page.tsx
planner/today/page.tsx
planner/[plannerId]/page.tsx
planner/[plannerId]/recovery/page.tsx
head/rounds/page.tsx
head/planners/page.tsx
School pages (portal/src/app/(school)/school/)

planner/page.tsx
planner/approvals/page.tsx
planner/[plannerId]/page.tsx
planner/rounds/page.tsx
timetable/manage/page.tsx
timetable/imports/[importId]/page.tsx
timetable/versions/[versionId]/page.tsx
setup/academic-calendar/page.tsx
4.4 Portal: modified files
portal/src/lib/api-client.ts: add an optional details?: unknown to ApiClientError, populated from payload.error.details. Keep this backward-compatible.
portal/src/lib/types.ts: add details?: unknown to ApiErrorBody.
portal/src/lib/display-labels.ts: add every new error code (§6.6) to API_ERROR_MESSAGES.
portal/src/components/layout/teacher-sidebar.tsx: add "Academic planner" (/teacher/planner) to baseNavItems. For head teachers, add "Classroom rounds" (/teacher/head/rounds) and "Section planners" (/teacher/head/planners) next to "Academic insights".
portal/src/components/layout/school-sidebar.tsx: add "Academic planner" (/school/planner) to mainNav, and add /school/setup/academic-calendar under the setup area. Follow the existing permission filtering with can(); no permission is required.
portal/src/app/(school)/school/timetable/page.tsx: keep the viewer, add a section selector (using the new sections and sectionId), a source badge, and a "Manage timetable" link (shown when can('MANAGE_CLASSES')).
portal/src/services/academics.service.ts: add an optional sectionId to listTimetable and extend its response type.
portal/src/app/(teacher)/teacher/dashboard/page.tsx: insert a "Today's planned lessons" card that renders today-lessons-list.tsx in compact mode and links to /teacher/planner/today. Do not restructure the dashboard.
portal/src/components/layout/ai-wait.tsx: add a 'planner' member to AiWaitKind, with copy suitable for chapter analysis.
5. Database schema and migration
5.1 General rules
Change must be additive only: new enums, new tables, enum values appended at the end, back-relation fields (which are virtual).
Do not alter or drop existing columns, indexes or enums.
Use @id @default(uuid()), snake_case @map/@@map, and createdAt @default(now()) @map("created_at") / updatedAt @updatedAt @map("updated_at"), matching the existing models.
Store dates as @db.Date written with dateFromIso. Store clock times as VarChar(5) "HH:MM", normalised with normalizeHm.
LongText and Text columns must be nullable or have no default (MySQL restriction; see commit "Keep library exercises text without a MySQL default").
MySQL has no partial unique indexes. "One working version" and "one approved version" are enforced with pointer columns marked @unique plus compare-and-set.
5.2 Additions to existing enums (append only)
// NotificationType: append
PLANNER_SUBMITTED
PLANNER_DECISION
SCHEDULE_CHANGE_SUBMITTED
SCHEDULE_CHANGE_DECISION
TIMETABLE_PUBLISHED
CLASSROOM_FOLLOW_UP
// AIRequestType: append
PLANNER_CHAPTER_ANALYSIS
TEACHING_ASSISTANCE
TIMETABLE_EXTRACTION
5.3 New enums
enum CalendarDayKind { NON_WORKING WORKING }
enum TimetableSourceType { CSV IMAGE MANUAL LEGACY }
enum TimetableImportStatus { UPLOADED EXTRACTED FAILED PUBLISHED DISCARDED }
enum TimetableVersionStatus { DRAFT PUBLISHED SUPERSEDED DISCARDED }
enum TimetablePeriodKind { LESSON BREAK OTHER }
enum PlannerExamType { ASSESSMENT MIDTERM FINAL_TERM }
enum PlannerStatus { DRAFT SUBMITTED CHANGES_REQUESTED REJECTED PUBLISHED REVISION_PENDING COMPLETED ARCHIVED }
enum PlannerVersionStatus { DRAFT SUBMITTED CHANGES_REQUESTED REJECTED APPROVED SUPERSEDED WITHDRAWN }
enum PlannerVersionOrigin { INITIAL REVISION RECOVERY }
enum PlannerExamRisk { NONE LOW MEDIUM HIGH }
enum PlannerContentStatus { AVAILABLE MISSING CHANGED }
enum PlannerAnalysisSource { AI PROVISIONAL MANUAL }
enum PlannerLessonKind { TEACHING ACTIVITY REVISION ASSESSMENT }
enum LessonStage {
  INTRODUCTION READING EXPLANATION WORKED_EXAMPLES GUIDED_PRACTICE INDEPENDENT_PRACTICE
  WRITTEN_EXERCISES DISCUSSION PRACTICAL_DEMONSTRATION ACTIVITY RECITATION VOCABULARY
  GRAMMAR COMPREHENSION REVISION ASSESSMENT
}
enum PlannerApprovalAction { SUBMITTED WITHDRAWN APPROVED REJECTED CHANGES_REQUESTED PUBLISHED_DIRECTLY REVISION_STARTED RECOVERY_PROPOSED ARCHIVED COMPLETED }
enum ScheduleChangeReason { TEACHER_ABSENCE SCHOOL_CLOSURE LESSON_DIFFICULTY PARTIAL_COMPLETION INSUFFICIENT_EXERCISE_TIME TIMETABLE_DISRUPTION OTHER }
enum TeachingRecordStatus { CONFIRMED IN_PROGRESS COMPLETED PARTIAL DIFFERENT_LESSON NOT_TAUGHT DELAYED }
enum ObservationMatch { MATCHES_PLAN PARTIAL_MATCH DIFFERENT_LESSON NO_LESSON_OBSERVED UNKNOWN }
5.4 New models
Add the matching back-relation arrays to the existing parent models.

model SchoolCalendarDay {
  id             String          @id @default(uuid())
  schoolId       String          @map("school_id")
  date           DateTime        @db.Date
  kind           CalendarDayKind
  scopeKey       String          @map("scope_key") @db.VarChar(80) // "ALL" | "GRADE:<gradeId>" | "SECTION:<sectionId>"
  gradeId        String?         @map("grade_id")
  sectionId      String?         @map("section_id")
  followsWeekday Weekday?        @map("follows_weekday") // required when kind=WORKING on Sat/Sun
  reason         String          @db.VarChar(255)
  createdById    String          @map("created_by_id")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")
  school         School          @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  @@unique([schoolId, date, scopeKey])
  @@index([schoolId, date])
  @@map("school_calendar_days")
}
model TimetableImport {
  id               String                @id @default(uuid())
  schoolId         String                @map("school_id")
  academicYearId   String                @map("academic_year_id")
  fileAssetId      String?               @map("file_asset_id")
  sourceType       TimetableSourceType   @map("source_type")
  status           TimetableImportStatus @default(UPLOADED)
  originalFilename String?               @map("original_filename") @db.VarChar(255)
  extractedText    String?               @map("extracted_text") @db.LongText
  warnings         Json?
  aiRequestId      String?               @map("ai_request_id") // no FK: AIRequest is purged by PlatformService
  uploadedById     String                @map("uploaded_by_id")
  createdAt        DateTime              @default(now()) @map("created_at")
  updatedAt        DateTime              @updatedAt @map("updated_at")
  school           School                @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  academicYear     AcademicYear          @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  fileAsset        FileAsset?            @relation(fields: [fileAssetId], references: [id], onDelete: SetNull)
  versions         TimetableVersion[]
  @@index([schoolId, createdAt])
  @@map("timetable_imports")
}
model TimetableVersion {
  id               String                 @id @default(uuid())
  schoolId         String                 @map("school_id")
  academicYearId   String                 @map("academic_year_id")
  sectionId        String                 @map("section_id")
  importId         String?                @map("import_id")
  sourceType       TimetableSourceType    @map("source_type")
  versionNumber    Int                    @map("version_number")
  status           TimetableVersionStatus @default(DRAFT)
  effectiveFrom    DateTime?              @map("effective_from") @db.Date
  effectiveTo      DateTime?              @map("effective_to") @db.Date
  basedOnVersionId String?                @map("based_on_version_id")
  revision         Int                    @default(0)
  validation       Json?
  notes            String?                @db.Text
  createdById      String                 @map("created_by_id")
  publishedById    String?                @map("published_by_id")
  publishedAt      DateTime?              @map("published_at")
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")
  school           School                 @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  academicYear     AcademicYear           @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  section          Section                @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  import           TimetableImport?      @relation(fields: [importId], references: [id], onDelete: SetNull)
  periods          TimetablePeriod[]
  @@unique([sectionId, academicYearId, versionNumber])
  @@index([schoolId, status])
  @@index([sectionId, status, effectiveFrom])
  @@map("timetable_versions")
}
model TimetablePeriod {
  id             String              @id @default(uuid())
  versionId      String              @map("version_id")
  weekday        Weekday
  periodNumber   Int?                @map("period_number") // null for BREAK/OTHER
  kind           TimetablePeriodKind @default(LESSON)
  startTime      String?             @map("start_time") @db.VarChar(5) // required at publish
  endTime        String?             @map("end_time") @db.VarChar(5)
  label          String              @db.VarChar(120)
  subjectId      String?             @map("subject_id")
  teacherId      String?             @map("teacher_id")
  room           String?             @db.VarChar(60)
  rawSubjectText String?             @map("raw_subject_text") @db.VarChar(255)
  rawTeacherText String?             @map("raw_teacher_text") @db.VarChar(255)
  sortOrder      Int                 @default(0) @map("sort_order")
  version        TimetableVersion    @relation(fields: [versionId], references: [id], onDelete: Cascade)
  subject        Subject?            @relation(fields: [subjectId], references: [id], onDelete: SetNull)
  teacher        TeacherProfile?     @relation(fields: [teacherId], references: [id], onDelete: SetNull)
  @@index([versionId, weekday])
  @@index([teacherId])
  @@map("timetable_periods")
}
// No DB unique on (versionId, weekday, periodNumber): drafts may hold extracted duplicates; publish validation blocks them.
model AcademicPlanner {
  id                String          @id @default(uuid())
  schoolId          String          @map("school_id")
  branchId          String          @map("branch_id")  // copied from section
  academicYearId    String          @map("academic_year_id")
  gradeId           String          @map("grade_id")   // copied from section
  sectionId         String          @map("section_id")
  subjectId         String          @map("subject_id")
  classSubjectId    String          @map("class_subject_id") // plain id; validated; used as creation mutex
  teacherId         String          @map("teacher_id")
  libraryBookId     String?         @map("library_book_id")
  examType          PlannerExamType @map("exam_type")
  examConfigId      String?         @map("exam_config_id")
  title             String          @db.VarChar(255)
  startDate         DateTime        @map("start_date") @db.Date
  examDate          DateTime        @map("exam_date") @db.Date
  status            PlannerStatus   @default(DRAFT)
  approvedVersionId String?         @unique @map("approved_version_id")
  workingVersionId  String?         @unique @map("working_version_id")
  lockRevision      Int             @default(0) @map("lock_revision")
  createdById       String          @map("created_by_id")
  completedAt       DateTime?       @map("completed_at")
  archivedAt        DateTime?       @map("archived_at")
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")
  school            School          @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  academicYear      AcademicYear    @relation(fields: [academicYearId], references: [id], onDelete: Cascade)
  section           Section         @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  subject           Subject         @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  teacher           TeacherProfile  @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  libraryBook       LibraryBook?    @relation(fields: [libraryBookId], references: [id], onDelete: SetNull)
  examConfig        ExamConfig?     @relation(fields: [examConfigId], references: [id], onDelete: SetNull)
  versions          AcademicPlannerVersion[]   @relation("PlannerVersions")
  approvedVersion   AcademicPlannerVersion?    @relation("PlannerApprovedVersion", fields: [approvedVersionId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  workingVersion    AcademicPlannerVersion?    @relation("PlannerWorkingVersion", fields: [workingVersionId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approvalEvents    PlannerApprovalEvent[]
  teachingRecords   TeachingRecord[]
  @@index([schoolId, status])
  @@index([sectionId, subjectId, academicYearId])
  @@index([teacherId, status])
  @@map("academic_planners")
}
model AcademicPlannerVersion {
  id               String               @id @default(uuid())
  plannerId        String               @map("planner_id")
  schoolId         String               @map("school_id")
  versionNumber    Int                  @map("version_number")
  status           PlannerVersionStatus @default(DRAFT)
  origin           PlannerVersionOrigin @default(INITIAL)
  basedOnVersionId String?              @map("based_on_version_id")
  revision         Int                  @default(0)
  settings         Json                 // PlannerSettings (§7.1)
  summary          Json?                // ScheduleSummary (§7.1)
  examRisk         PlannerExamRisk?     @map("exam_risk")
  changeReason     ScheduleChangeReason? @map("change_reason")
  changeReasonNote String?              @map("change_reason_note") @db.Text
  impact           Json?                // RecoveryImpact (§14)
  createdById      String               @map("created_by_id")
  submittedById    String?              @map("submitted_by_id")
  submittedAt      DateTime?            @map("submitted_at")
  decidedById      String?              @map("decided_by_id")
  decidedAt        DateTime?            @map("decided_at")
  decisionComment  String?              @map("decision_comment") @db.Text
  createdAt        DateTime             @default(now()) @map("created_at")
  updatedAt        DateTime             @updatedAt @map("updated_at")
  planner          AcademicPlanner      @relation("PlannerVersions", fields: [plannerId], references: [id], onDelete: Cascade)
  approvedFor      AcademicPlanner?     @relation("PlannerApprovedVersion")
  workingFor       AcademicPlanner?     @relation("PlannerWorkingVersion")
  chapters         PlannerChapter[]
  activities       PlannerActivity[]
  lessons          PlannerLesson[]
  @@unique([plannerId, versionNumber])
  @@index([schoolId, status])
  @@map("academic_planner_versions")
}
model PlannerChapter {
  id                   String                 @id @default(uuid())
  versionId            String                 @map("version_id")
  chapterKey           String                 @map("chapter_key") @db.VarChar(64) // stable across versions
  libraryBookChapterId String?                @map("library_book_chapter_id")
  sortOrder            Int                    @map("sort_order")
  titleSnapshot        String                 @map("title_snapshot") @db.VarChar(255)
  contentHash          String?                @map("content_hash") @db.VarChar(64)
  contentStatus        PlannerContentStatus   @map("content_status")
  required             Boolean                @default(true)
  activitiesEnabled    Boolean                @default(false) @map("activities_enabled")
  activityCount        Int                    @default(1) @map("activity_count")
  analysis             Json?                  // validated ChapterAnalysis (§8.2)
  analysisSource       PlannerAnalysisSource? @map("analysis_source")
  analysisWarnings     Json?                  @map("analysis_warnings")
  analyzedAt           DateTime?              @map("analyzed_at")
  version              AcademicPlannerVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  libraryBookChapter   LibraryBookChapter?    @relation(fields: [libraryBookChapterId], references: [id], onDelete: SetNull)
  activities           PlannerActivity[]
  lessons              PlannerLesson[]
  @@unique([versionId, chapterKey])
  @@index([libraryBookChapterId, contentHash])
  @@map("planner_chapters")
}
model PlannerActivity {
  id               String                 @id @default(uuid())
  versionId        String                 @map("version_id")
  plannerChapterId String                 @map("planner_chapter_id")
  activityKey      String                 @map("activity_key") @db.VarChar(64)
  title            String                 @db.VarChar(255)
  description      String?                @db.Text
  minutes          Int
  afterPortionKey  String?                @map("after_portion_key") @db.VarChar(64)
  optional         Boolean                @default(true)
  sortOrder        Int                    @map("sort_order")
  source           PlannerAnalysisSource
  version          AcademicPlannerVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  chapter          PlannerChapter         @relation(fields: [plannerChapterId], references: [id], onDelete: Cascade)
  @@unique([versionId, activityKey])
  @@map("planner_activities")
}
model PlannerLesson {
  id               String                 @id @default(uuid())
  versionId        String                 @map("version_id")
  plannerChapterId String?                @map("planner_chapter_id") // null for REVISION lessons spanning chapters
  lessonKey        String                 @map("lesson_key") @db.VarChar(64) // stable across versions
  sequence         Int
  kind             PlannerLessonKind
  title            String                 @db.VarChar(255)
  primaryStage     LessonStage            @map("primary_stage")
  stages           Json                   // StageSegment[]; sum(minutes) <= slot minutes
  objectives       Json                   // string[]
  portionKeys      Json                   @map("portion_keys") // string[]
  dependsOnKeys    Json                   @map("depends_on_keys") // lessonKey[]
  plannedMinutes   Int                    @map("planned_minutes")
  scheduledDate    DateTime?              @map("scheduled_date") @db.Date // null = unscheduled overflow (content never deleted)
  periodNumber     Int?                   @map("period_number") // 0 for class-teacher pattern day slot
  slotStartTime    String?                @map("slot_start_time") @db.VarChar(5)
  slotEndTime      String?                @map("slot_end_time") @db.VarChar(5)
  frozen           Boolean                @default(false)
  isContinuation   Boolean                @default(false) @map("is_continuation")
  notes            String?                @db.Text
  version          AcademicPlannerVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  chapter          PlannerChapter?        @relation(fields: [plannerChapterId], references: [id], onDelete: Cascade)
  @@unique([versionId, lessonKey])
  @@unique([versionId, scheduledDate, periodNumber]) // MySQL allows multiple NULLs -> unscheduled rows OK
  @@index([versionId, sequence])
  @@map("planner_lessons")
}
model PlannerApprovalEvent {
  id          String                @id @default(uuid())
  schoolId    String                @map("school_id")
  plannerId   String                @map("planner_id")
  versionId   String                @map("version_id")
  action      PlannerApprovalAction
  fromStatus  String?               @map("from_status") @db.VarChar(40)
  toStatus    String?               @map("to_status") @db.VarChar(40)
  actorUserId String                @map("actor_user_id")
  comment     String?               @db.Text
  createdAt   DateTime              @default(now()) @map("created_at")
  planner     AcademicPlanner       @relation(fields: [plannerId], references: [id], onDelete: Cascade)
  @@index([plannerId, createdAt])
  @@index([schoolId, action, createdAt])
  @@map("planner_approval_events")
}
model TeachingRecord {
  id                     String               @id @default(uuid())
  schoolId               String               @map("school_id")
  plannerId              String               @map("planner_id")
  sectionId              String               @map("section_id")
  subjectId              String               @map("subject_id")
  teacherId              String               @map("teacher_id") // TeacherProfile who taught
  recordedById           String               @map("recorded_by_id")
  date                   DateTime             @db.Date
  periodNumber           Int                  @default(0) @map("period_number") // 0 = class-teacher day
  plannerVersionId       String?              @map("planner_version_id") // official version at record time
  plannedLessonKey       String?              @map("planned_lesson_key") @db.VarChar(64)
  status                 TeachingRecordStatus
  actualLessons          Json                 @map("actual_lessons") // [{lessonKey, outcome:'COMPLETED'|'PARTIAL', completedStageIndexes?:number[]}]
  actualLibraryChapterId String?              @map("actual_library_chapter_id")
  completedPortionNote   String?              @map("completed_portion_note") @db.Text
  unfinishedPortionNote  String?              @map("unfinished_portion_note") @db.Text
  actualMinutes          Int?                 @map("actual_minutes")
  notes                  String?              @db.Text
  lateReport             Boolean              @default(false) @map("late_report")
  createdAt              DateTime             @default(now()) @map("created_at")
  updatedAt              DateTime             @updatedAt @map("updated_at")
  school                 School               @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  planner                AcademicPlanner      @relation(fields: [plannerId], references: [id], onDelete: Cascade)
  section                Section              @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  subject                Subject              @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  teacher                TeacherProfile       @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  @@unique([plannerId, date, periodNumber])
  @@index([schoolId, date])
  @@index([teacherId, date])
  @@index([plannerId, plannedLessonKey])
  @@map("teaching_records")
}
model ClassroomObservation {
  id                       String           @id @default(uuid())
  schoolId                 String           @map("school_id")
  sectionId                String           @map("section_id")
  subjectId                String?          @map("subject_id")
  teacherId                String?          @map("teacher_id")
  plannerId                String?          @map("planner_id")
  plannerVersionId         String?          @map("planner_version_id")
  plannedLessonKey         String?          @map("planned_lesson_key") @db.VarChar(64)
  observedLessonKey        String?          @map("observed_lesson_key") @db.VarChar(64)
  observedLibraryChapterId String?          @map("observed_library_chapter_id")
  observedStage            LessonStage?     @map("observed_stage")
  date                     DateTime         @db.Date
  periodNumber             Int?             @map("period_number")
  observedAt               DateTime         @map("observed_at")
  observerUserId           String           @map("observer_user_id")
  clientRequestId          String?          @unique @map("client_request_id") @db.VarChar(64) // idempotent mobile retries
  teacherPresent           Boolean?         @map("teacher_present")
  match                    ObservationMatch
  notes                    String?          @db.Text
  followUpRequired         Boolean          @default(false) @map("follow_up_required")
  followUpAction           String?          @map("follow_up_action") @db.Text
  followUpDueDate          DateTime?        @map("follow_up_due_date") @db.Date
  followUpResolvedAt       DateTime?        @map("follow_up_resolved_at")
  followUpResolvedById     String?          @map("follow_up_resolved_by_id")
  sharedWithTeacher        Boolean          @default(false) @map("shared_with_teacher")
  createdAt                DateTime         @default(now()) @map("created_at")
  updatedAt                DateTime         @updatedAt @map("updated_at")
  school                   School           @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  section                  Section          @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  @@index([schoolId, date])
  @@index([sectionId, date, periodNumber])
  @@index([teacherId, date])
  @@index([schoolId, followUpRequired, followUpResolvedAt])
  @@map("classroom_observations")
}
5.5 Back-relations to add
School: schoolCalendarDays, timetableImports, timetableVersions, academicPlanners, teachingRecords, classroomObservations
AcademicYear: timetableImports, timetableVersions, academicPlanners
Section: timetableVersions, academicPlanners, teachingRecords, classroomObservations
Subject: timetablePeriods, academicPlanners, teachingRecords
TeacherProfile: timetablePeriods, academicPlanners, teachingRecords
LibraryBook: academicPlanners
LibraryBookChapter: plannerChapters
ExamConfig: academicPlanners
FileAsset: timetableImports
5.6 Integrity enforced in code (MySQL cannot express these)
No overlap of non-archived planners for the same sectionId + subjectId + academicYearId with intersecting [startDate, examDate] (409 PLANNER_OVERLAP).
workingVersionId must point at a version in DRAFT, SUBMITTED or CHANGES_REQUESTED.
approvedVersionId must point at a version in APPROVED.
All keys inside JSON columns (portionKeys, dependsOnKeys, actualLessons[].lessonKey) must exist in the referenced version.
TimetableVersion effective ranges per section never overlap (append-only, §12.5).
Archival: planners are archived (archivedAt, status ARCHIVED), not deleted. Hard delete is allowed only for planners never submitted and without records.
5.7 Migration procedure
Edit schema.prisma.
Run npx prisma format, npx prisma validate, npx prisma generate.
Run npx tsc --noEmit -p tsconfig.json.
Only against a safe local test database (§0.2): npx prisma db push --skip-generate. Optionally review the DDL with npx prisma migrate diff --from-url <local test url> --to-schema-datamodel prisma/schema.prisma --script. This is a read-only diff; never use it against the remote URL.
Do not create a file in prisma/migrations/. Deploys use db push, and adding a migration to the out-of-sync history is misleading.
Rollback: every addition is a new table or an appended enum value. Rolling back the code leaves unused tables in place, which is harmless. Dropping them is a manual DBA action and must never be scripted here.
6. API contracts
All routes are under /api/v1. Responses are wrapped { success: true, data } and errors are { success: false, error: { code, message, details? } }.

6.1 Common conventions
Dates: YYYY-MM-DD strings in both directions. Validate with @Matches(/^\d{4}-\d{2}-\d{2}$/) and convert with dateFromIso. Serialise @db.Date values as toISOString().slice(0, 10).
Times: "HH:MM".
Revisions: every draft mutation takes expectedRevision: number and returns the full PlannerVersionPayload (§7.1) with the new version.revision.
Ownership checks: every :id lookup uses findFirst({ where: { id, schoolId } }). Never use a bare findUnique by id followed by trusting the result.
Super admins have no school context. TenantService.requireSchoolId rejects them, so all planner, timetable and rounds APIs are school-context only.
6.2 Academic calendar: school-calendar.controller.ts
Method & path	Roles / permission	Request	Response	Notes
GET /academic-calendar/days?from&to
SCHOOL_ADMIN, TEACHER
—
SchoolCalendarDay[] + HOLIDAY events in range
Range ≤ 400 days
POST /academic-calendar/days
SCHOOL_ADMIN + MANAGE_CLASSES
{ date, kind, scope:'ALL'|'GRADE'|'SECTION', gradeId?, sectionId?, followsWeekday?, reason }
created row
Grade or section must belong to the school. WORKING on Sat/Sun requires followsWeekday. A duplicate (date, scopeKey) returns 409 CALENDAR_DAY_EXISTS. Audit CALENDAR_DAY_CREATED.
DELETE /academic-calendar/days/:id
same
—
{ deleted: true }
Audit CALENDAR_DAY_DELETED
GET /academic-calendar/working-days?sectionId&from&to
SCHOOL_ADMIN, TEACHER
—
[{ date, working, reason, timetableWeekday }]
Teachers are limited to sections they teach or head
6.3 Timetables: timetables.controller.ts
Write routes require @Roles(SCHOOL_ADMIN) + @RequirePermission('MANAGE_CLASSES'). Reads allow SCHOOL_ADMIN and TEACHER.

Method & path	Request	Response / behaviour
POST /timetables/imports (multipart file, body academicYearId?)
FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 MB }, fileFilter }) accepting text/csv, application/vnd.ms-excel with a .csv name, image/jpeg, image/png, image/webp. XLSX or PDF returns 400 UNSUPPORTED_TIMETABLE_FORMAT.
Saves through FilesService.saveSchoolUpload(schoolId, user.id, file, 'timetables'), creates the import, runs extraction synchronously (CSV is deterministic; images go through PageOcrService.readPageTexts then TimetableExtractionService), and creates one DRAFT TimetableVersion per detected section, each with validation. Returns ImportPayload { import, versions[{ id, sectionId?, classLabel, periods, validation }], unresolvedClasses[] }. A detected class that matches several sections becomes an unresolved draft; the reviewer must pick a section before publishing. Audit TIMETABLE_IMPORTED.
GET /timetables/imports
—
List, newest first, paginated ?page&limit
GET /timetables/imports/:id
—
ImportPayload
POST /timetables/imports/:id/extract
—
Re-extracts. Replaces only DRAFT versions from this import. 409 IMPORT_ALREADY_PUBLISHED if any of its versions are published.
POST /timetables/imports/:id/discard
—
Marks the import DISCARDED and its draft versions DISCARDED
GET /timetables/versions?sectionId&status
—
List
POST /timetables/versions
{ sectionId, academicYearId?, cloneFromVersionId? }
New MANUAL DRAFT, optionally copying the periods of a version
GET /timetables/versions/:id
—
Version with periods and validation
PUT /timetables/versions/:id
{ expectedRevision, sectionId?, periods: PeriodInput[] } where PeriodInput = { weekday, periodNumber?, kind, startTime?, endTime?, label, subjectId?, teacherId?, room? }
DRAFT only, otherwise 409 TIMETABLE_VERSION_NOT_EDITABLE. Compare-and-set on revision, otherwise 409 TIMETABLE_VERSION_CONFLICT. Replaces periods (deleteMany + createMany in one transaction), re-validates, returns the version.
POST /timetables/versions/:id/validate
—
Validation report; no state change
POST /timetables/publish
{ items: [{ versionId, expectedRevision }], effectiveFrom }
All-or-nothing transaction (§12.5). Blocking issues return 422 TIMETABLE_INVALID with details.issues. Returns the published versions plus affectedPlanners[]. Audit TIMETABLE_PUBLISHED. Notifies the teachers who have periods in those sections (TIMETABLE_PUBLISHED).
POST /timetables/legacy/adopt
{ sectionIds?: string[] }
For sections with legacy TimetableSlot rows and no versions, creates PUBLISHED LEGACY versions with effectiveFrom = academicYear.startDate. Idempotent: skips sections that already have versions.
GET /timetables/resolve?sectionId&date
—
{ source, versionId?, working, reason, periods[] } for that date
Changed route: GET /academics/timetable?gradeId&sectionId?. Same shape as today plus sectionId, versionId, source, sections.

6.4 Academic planners: academic-planners.controller.ts
The controller carries @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER) (PRINCIPAL passes through RolesGuard). Fine-grained checks happen in PlannerAccessService. The path prefix /academic-planners/:id/versions/:versionId is written …/v/:vid below.

Method & path	Request	Response	Rules
GET /academic-planners/options?sectionId&subjectId
—
{ section, subject, eligibleTeachers[], grantedBooks[{ id, title, classLabel, subjectLabel, suggested: boolean }], examConfigs[{ id, name, startDate }], timetable: { source, periodsPerWeek, typicalMinutes } | null, overlappingPlanners[] }
Actor must be able to create for this section and subject
GET /academic-planners/books/:bookId/chapters
—
[{ id, chapterNumber, title, hasContent, wordCount }]
Grant must have canRead, otherwise 403 BOOK_NOT_ASSIGNED
POST /academic-planners
CreatePlannerDto { sectionId, subjectId, teacherId, examType, examConfigId?, examDate, startDate?, libraryBookId, chapterIds: string[] (1..40, ordered, unique), settings?: { revisionSlots?: 0..10, fallbackPeriodsPerWeek?: 1..15, fallbackPeriodMinutes?: 20..120, minChapterStartMinutes?: 0..30 } }
PlannerVersionPayload (version 1, DRAFT, chapters not analysed, no lessons)
§7.2 create
GET /academic-planners?status&sectionId&subjectId&teacherId&scope=mine|section|school
—
PlannerListItem[]
Scoped by the access service
GET /academic-planners/approvals
—
{ planners[], recoveries[] }: SUBMITTED versions in the school, excluding the actor's own submissions from the decide action
Principal or admin only
GET /academic-planners/:id
—
{ planner, versions[{ id, versionNumber, status, origin, createdAt, submittedAt, decidedAt }], approvalEvents[], contentChanges[] }
View access
GET …/v/:vid
—
PlannerVersionPayload
View access
POST …/v/:vid/chapters/:chapterKey/analyze
{ expectedRevision, force?: boolean }
PlannerVersionPayload
Edit access; AI (§8.3); does not schedule
POST …/v/:vid/generate
{ expectedRevision }
PlannerVersionPayload
Every chapter must have an analysis (AI, PROVISIONAL or MANUAL), otherwise 422 CHAPTER_NOT_ANALYZED with details.chapterKeys. Replaces all non-frozen lessons.
PATCH …/v/:vid/chapters/:chapterKey
{ expectedRevision, activitiesEnabled?, activityCount?: 0..5, required? }
payload
Reflows from the chapter's first lesson
PUT …/v/:vid/chapter-order
{ expectedRevision, chapterKeys: string[] }
payload
Must be a permutation of the existing keys. Reflows.
PUT …/v/:vid/chapters
{ expectedRevision, add?: string[] (libraryBookChapterIds), remove?: string[] (chapterKeys), confirmRemoveRequired?: boolean }
payload
Removing a required chapter with lessons needs confirmRemoveRequired, otherwise 422 CONFIRMATION_REQUIRED. Added chapters start unanalysed.
POST …/v/:vid/activities
{ expectedRevision, chapterKey, title, description?, minutes: 5..120, afterPortionKey? }
payload
Source MANUAL. Reflows.
PATCH …/v/:vid/activities/:activityKey
{ expectedRevision, title?, description?, minutes?, afterPortionKey? }
payload
Reflows
DELETE …/v/:vid/activities/:activityKey?expectedRevision=N
—
payload
Removes the activity's segments only; asserts portion coverage (§9.6)
POST …/v/:vid/activities/regenerate
{ expectedRevision, chapterKey, count: 1..5 }
payload
AI; replaces non-MANUAL activities of that chapter
POST …/v/:vid/lessons/:lessonKey/move
{ expectedRevision, targetDate, targetPeriodNumber, mode: 'SINGLE' | 'WITH_FOLLOWING' }
payload
§9.5
PUT …/v/:vid/lesson-order
{ expectedRevision, chapterKey, lessonKeys: string[] }
payload
Topological validation, then re-pack
PATCH …/v/:vid/lessons/:lessonKey
{ expectedRevision, title?, objectives?: string[], notes?, stages?: [{ stage, minutes }] }
payload
Changing stage minutes spills and re-packs (§9.5)
POST …/v/:vid/submit
{ expectedRevision, acknowledgeRisk?: boolean, note? }
payload
§11
POST …/v/:vid/withdraw
{}
payload
Submitter only, while SUBMITTED
POST …/v/:vid/approve
{ expectedRevision, comment? }
payload
Principal or admin; not the submitter
POST …/v/:vid/reject
{ expectedRevision, comment } (comment 3..2000 required)
payload
POST …/v/:vid/request-changes
{ expectedRevision, comment } (required)
payload
POST …/v/:vid/publish
{ expectedRevision, acknowledgeRisk?, comment? }
payload
Direct publish: only when the version's creator is a principal or admin and no submission is needed (§11.3)
POST /academic-planners/:id/revisions
{ basedOnVersionId }
payload of the new DRAFT (origin REVISION)
Base must be the approved version, or the latest REJECTED version if none is approved. 409 WORKING_VERSION_EXISTS (details include workingVersionId)
POST /academic-planners/:id/recovery-proposals
{ reason: ScheduleChangeReason, reasonNote?, allowBufferUse?: boolean (default true), allowActivityRemoval?: boolean (default false), allowCompression?: boolean (default true) }
payload of the RECOVERY DRAFT, with impact
§14
POST /academic-planners/:id/archive
{ comment? }
planner
Principal or admin
POST /academic-planners/:id/complete
{}
planner
Allowed after examDate; principal, admin or assigned teacher
DELETE /academic-planners/:id
—
{ deleted: true }
Only if never submitted and no teaching records, otherwise 409 PLANNER_NOT_DELETABLE
GET /academic-planners/my-day?date=
—
MyDayPayload (§13.2)
Teachers; date defaults to today in the school timezone
PUT /academic-planners/:id/records
UpsertTeachingRecordDto (§13.3)
TeachingRecord
§13
GET /academic-planners/:id/records?from&to
—
TeachingRecord[]
View access
POST /academic-planners/:id/lessons/:lessonKey/teaching-help
{ versionId? } (defaults to the approved version)
TeachingHelpPayload (§8.5)
View access as the assigned teacher, the head teacher of the section, or principal/admin; read-only
6.5 Classroom rounds and reports
classroom-rounds.controller.ts: @Roles(SCHOOL_ADMIN, TEACHER). Teachers must be head teachers (assertHeadTeacher) except where noted.

Method & path	Request	Response	Rules
GET /classroom-rounds/now?at=<ISO datetime>&sectionIds=a,b
—
RoundsPayload (§12)
Head teacher: own sections. Principal/admin: the whole school, filterable. Not cached.
POST /classroom-rounds/observations
{ clientRequestId (uuid), sectionId, date, periodNumber?, subjectId?, plannerId?, observedLessonKey?, observedLibraryChapterId?, observedStage?, teacherPresent?, match, notes? (≤2000), followUpRequired, followUpAction?, followUpDueDate?, sharedWithTeacher? }
observation
A repeated clientRequestId from the same observer returns the existing row with 200. date must not be in the future. The server re-resolves teacher, planner, version and planned lesson for (section, date, period) and does not trust client values. Audit CLASSROOM_OBSERVATION_RECORDED. If followUpRequired && sharedWithTeacher, notify the teacher (CLASSROOM_FOLLOW_UP).
GET /classroom-rounds/observations?from&to&sectionId&teacherId&followUpOpen
—
list
Head teacher: own sections. Principal/admin: school. A teacher with no head assignment sees only their own observations with sharedWithTeacher=true, and may call only this route.
PATCH /classroom-rounds/observations/:id
same optional fields
observation
Observer only, within 24h of createdAt, otherwise 403 OBSERVATION_LOCKED. Audit with before and after values.
POST /classroom-rounds/observations/:id/resolve-follow-up
{ note? }
observation
Observer, the section's head teacher, or principal/admin
planner-reports.controller.ts

Method & path	Response	Scope
GET /planner-reports/overview?academicYearId&sectionId&subjectId&teacherId
OverviewPayload (§16)
Principal/admin: school. Head teacher: own sections. Teacher: own planners.
GET /planner-reports/planners/:id/progress
PlannerProgressPayload (per-lesson rows)
View access
6.6 Error codes
Add every code below to the portal's API_ERROR_MESSAGES.

Code	HTTP status
PLANNER_NOT_FOUND, TIMETABLE_VERSION_NOT_FOUND, LESSON_NOT_FOUND
404
PLANNER_FORBIDDEN, RECORD_FORBIDDEN, OBSERVATION_FORBIDDEN, OBSERVATION_LOCKED, BOOK_NOT_ASSIGNED, SELF_APPROVAL_FORBIDDEN, SECTION_OUT_OF_SCOPE (existing), HEAD_TEACHER_REQUIRED (existing)
403
PLANNER_OVERLAP, PLANNER_VERSION_CONFLICT (details { currentRevision, status }), VERSION_NOT_EDITABLE, WORKING_VERSION_EXISTS, ALREADY_DECIDED, BASELINE_CHANGED, SLOT_OCCUPIED, PLANNER_NOT_DELETABLE, TIMETABLE_VERSION_CONFLICT, TIMETABLE_VERSION_NOT_EDITABLE, IMPORT_ALREADY_PUBLISHED, CALENDAR_DAY_EXISTS
409
CHAPTER_NOT_ANALYZED, TIMETABLE_REQUIRED, DEPENDENCY_VIOLATION (details { violations }), SLOT_NOT_AVAILABLE, FROZEN_LESSON, EXAM_DATE_INVALID, START_DATE_INVALID, RISK_ACKNOWLEDGEMENT_REQUIRED (details { feasibility, shortfallMinutes }), CONFIRMATION_REQUIRED, COVERAGE_VIOLATION, RECORD_FUTURE_DATE, RECORD_LESSON_INVALID, RECORD_PLANNER_NOT_PUBLISHED, TIMETABLE_INVALID (details { issues }), TIMETABLE_EFFECTIVE_DATE_INVALID, RECOVERY_NOT_NEEDED
422
UNSUPPORTED_TIMETABLE_FORMAT, COMMENT_REQUIRED
400
AI_ANALYSIS_FAILED, TIMETABLE_EXTRACTION_FAILED
502 (only when no fallback applies)
7. Service and domain logic
7.1 Core types (academic-planner/planner-types.ts)
export type StageSegment = { stage: LessonStage; minutes: number; portionKey?: string; activityKey?: string; part?: number; partCount?: number };
export type PlannerSettings = {
  revisionSlots: number;                 // default computed (§9.2), stored explicitly
  minRevisionSlots: number;              // floor for recovery, default 1
  minChapterStartMinutes: number;        // default 10
  fallbackPeriodsPerWeek?: number;       // only when no timetable
  fallbackPeriodMinutes?: number;
  lastTeachingDate: string;              // examDate - 1 day by default
};
export type ScheduleSummary = {
  totalSlots: number; teachingSlots: number; revisionSlots: number; usedSlots: number; slackSlots: number;
  requiredMinutes: number; capacityMinutes: number; unscheduledLessonCount: number;
  predictedCompletionDate: string | null;
  feasibility: 'FEASIBLE' | 'AT_RISK' | 'INFEASIBLE'; shortfallMinutes: number;
  alternatives: Array<{ code: 'USE_REVISION_BUFFER'|'COMPRESS_PRACTICE'|'DROP_OPTIONAL_ACTIVITIES'|'ADD_PERIODS'|'ADD_WORKING_DAYS'|'LATER_EXAM_DATE'; detail: string; recoversMinutes?: number; earliestFeasibleExamDate?: string }>;
  warnings: Array<{ code: string; message: string; chapterKey?: string; lessonKey?: string }>;
  timetableSource: 'VERSIONED' | 'LEGACY' | 'FALLBACK';
};
export type PlannerVersionPayload = {
  planner: { id; title; status; sectionId; classLabel; subject: { id; name }; teacher: { id; name }; examType; examDate; startDate; approvedVersionId; workingVersionId; lockRevision; libraryBook: { id; title } | null };
  version: { id; versionNumber; status; origin; revision; basedOnVersionId; settings: PlannerSettings; summary: ScheduleSummary | null; examRisk; changeReason; changeReasonNote; impact; submittedAt; decidedAt; decisionComment; createdById };
  permissions: { canEdit; canSubmit; canWithdraw; canDecide; canPublishDirectly; canCreateRevision; canRequestRecovery; canRecord };
  chapters: Array<{ chapterKey; libraryBookChapterId; title; sortOrder; required; contentStatus; analysisSource; analysisWarnings; activitiesEnabled; activityCount; analysisSummary: { complexity; totalMinutes; objectives: string[]; portions: Array<{ portionKey; title }> } | null }>;
  activities: Array<{ activityKey; chapterKey; title; description; minutes; afterPortionKey; optional; source }>;
  lessons: Array<{ lessonKey; chapterKey; sequence; kind; title; primaryStage; stages: StageSegment[]; objectives: string[]; plannedMinutes; dependsOnKeys: string[]; date: string | null; periodNumber: number | null; startTime; endTime; frozen; isContinuation; progress: { outcome: 'COMPLETED'|'PARTIAL'|'NOT_TAUGHT'|'UNREPORTED'|null; recordId: string | null } | null }>;
  calendar: { from: string; to: string; lastTeachingDate: string; examDate: string; days: Array<{ date; working: boolean; reason: string | null; slots: Array<{ periodNumber; startTime; endTime; minutes; reserved?: 'REVISION' }> }> };
  warnings: ScheduleSummary['warnings'];
};
7.2 AcademicPlannersService
create(user, dto)

Resolve the actor through PlannerAccessService.resolveActor.
Load the section (school-scoped, with grade and branch), the subject (school-scoped), and the current AcademicYear (isCurrent: true, school-scoped).
Load the ClassSubject row by (sectionId, subjectId, academicYearId). If it is missing, return 422 CLASS_SUBJECT_NOT_FOUND.
Check assertCanCreate(actor, section, classSubject, dto.teacherId).
Validate dates:
startDate defaults to today (school timezone) and must be ≥ today and ≥ academicYear.startDate.
examDate must be > startDate and ≤ academicYear.endDate.
Otherwise return EXAM_DATE_INVALID or START_DATE_INVALID.
If examConfigId is given, it must belong to the year. When ExamConfig.startDate exists and differs from examDate, record a warning. Never overwrite either date.
Validate the book grant (canRead). Every chapterIds entry must belong to that book; otherwise 422 CHAPTER_NOT_IN_BOOK.
Run a transaction:
SELECT id FROM class_subjects WHERE id = ? FOR UPDATE (serialises creation per class subject).
Run the overlap query; on overlap, 409 PLANNER_OVERLAP with details { plannerId }.
Create the planner (DRAFT, classSubjectId).
Create version 1 (DRAFT, INITIAL, revision 0, settings).
Create PlannerChapter rows. Use chapterKey = randomUUID(). Snapshot the title. Set contentHash = sha256(joinCompiledChapter(publishedText, exercisesText)). Set contentStatus to MISSING when the trimmed joined text is under 200 characters, otherwise AVAILABLE.
Set planner.workingVersionId.
Create a PlannerApprovalEvent? No: approval events cover approval actions only. Write an audit entry ACADEMIC_PLANNER_CREATED after commit.
Return the payload.
getVersionPayload(actor, plannerId, versionId)

Load the planner with version, chapters, activities and lessons (orderBy sequence).
Build calendar via ScheduleSlotsService. This is the function buildTeachingSlots in schedule-engine.ts, fed by the resolver and the calendar service.
Attach progress from teaching records when the version is the approved one.
Compute permissions through the access service.
Compare each chapter's current library content hash with its snapshot. A difference becomes a warning CHAPTER_CONTENT_CHANGED; a deleted chapter becomes CHAPTER_CONTENT_REMOVED. Approved versions are never changed.
Edit-method skeleton. Analyse, generate, chapter and activity changes, moves, reorders and lesson patches all follow this shape:

return this.prisma.$transaction(async (tx) => {
  const { planner, version } = await this.loadEditable(tx, actor, plannerId, versionId); // school-scoped; status in DRAFT|CHANGES_REQUESTED; access.assertCanEdit
  await casVersionRevision(tx, version.id, dto.expectedRevision); // updateMany count===1 else throw ConflictException({ error: { code:'PLANNER_VERSION_CONFLICT', message, details:{ currentRevision, status } } })
  const slots = await this.slots.build(tx, planner, version.settings);
  const next = scheduleEngine.<operation>(currentState, slots, args);   // pure
  if (next.violations.length) throw new UnprocessableEntityException({ error: { code: 'DEPENDENCY_VIOLATION', message, details: { violations: next.violations } } });
  await this.persistLessons(tx, version.id, next.lessons);              // deleteMany non-frozen + createMany; preserves lessonKeys (§9.4)
  await tx.academicPlannerVersion.update({ where: { id: version.id }, data: { summary: next.summary, examRisk: riskFrom(next.summary) } });
  return version.id;
}).then((id) => this.getVersionPayload(actor, plannerId, id));
Write audit entries after commit, with action names such as PLANNER_LESSON_MOVED, PLANNER_ACTIVITY_DELETED and PLANNER_CHAPTERS_REORDERED, and metadata { versionId, lessonKey, from, to }.

Analysis call ordering. analyzeChapter calls the AI outside the transaction, because AI latency is far beyond the 15s maxWait. Then:

Re-open a transaction.
Compare-and-set the revision against the original expectedRevision.
Write analysis and the default activities.
If someone else edited during the AI call, return the conflict. Keep the AI result in the cache (§8.3) so a retry is free.

7.3 PlannerApprovalService
The full contract is in §11. Approval decisions write a PlannerApprovalEvent inside the transaction and an AuditLog entry plus notifications after commit.

7.4 PlannerAccessService
The full contract is in §16.

7.5 TeachingRecordsService, ClassroomRoundsService, PlannerRecoveryService, PlannerReportsService
See §13, §12, §14 and §16. Each service must:

resolve the actor first;
add schoolId to every query;
keep pure computations in the corresponding pure module;
return DTO-shaped plain objects, never raw Prisma includes containing user emails or passwords.
8. AI integration
8.1 Provider extension
Add these methods to AiProvider in ai/providers/ai.provider.ts:

analyzePlannerChapter(input: PlannerChapterAnalysisInput): Promise<AiCompletionResult<unknown>>; // raw JSON, validated by service
generateTeachingHelp(input: TeachingHelpInput): Promise<AiCompletionResult<unknown>>;
extractTimetable(input: { ocrText: string; images?: Array<{ mimeType: string; base64: string }> }): Promise<AiCompletionResult<unknown>>;
OpenAiProvider: reuse the private chat(system, user, images). When OPENAI_API_KEY is missing, return a deterministic mock (§8.4 heuristics for analysis; a fixed small structure for help; an empty extraction).
CursorProvider: reuse complete() with the new optional timeoutMs. Read the analysis timeout from the env var PLANNER_ANALYSIS_TIMEOUT_MS (default 90000; 25000 when isServerlessRuntime()). For images, follow the existing image-capable path in cursor.provider.ts. If none exists for JSON, use OCR text only.
Services inject FAST_AI_PROVIDER.
8.2 Chapter analysis schema (ai/schemas/planner-chapter-analysis.schema.ts)
export const PlannerChapterAnalysisSchema = z.object({
  complexity: z.enum(['LOW','MEDIUM','HIGH']),
  objectives: z.array(z.string().min(3).max(300)).min(1).max(12),
  prerequisites: z.array(z.string().max(200)).max(10).default([]),
  portions: z.array(z.object({
    portionKey: z.string().regex(/^p\d{1,3}$/),
    title: z.string().min(2).max(160),
    contentAnchor: z.string().min(8).max(120),           // verbatim snippet from chapter text
    kind: z.enum(['CONCEPT','READING','EXERCISE_SET','PRACTICAL','RECITATION','GRAMMAR','VOCABULARY','ASSESSMENT']),
    stages: z.array(z.object({ stage: z.nativeEnum(LessonStage), minutes: z.number().int().min(3).max(240) })).min(1).max(8),
    minMinutes: z.number().int().min(3), maxMinutes: z.number().int().max(600),
    dependsOn: z.array(z.string()).max(6).default([]),
    exerciseCount: z.number().int().min(0).max(200).default(0),
    compressible: z.boolean().default(false),
  })).min(1).max(40),
  activitySuggestions: z.array(z.object({ title: z.string().max(160), description: z.string().max(600), minutes: z.number().int().min(5).max(120), afterPortionKey: z.string().nullable() })).max(5),
  revisionMinutes: z.number().int().min(0).max(240),
  assessmentMinutes: z.number().int().min(0).max(240),
  practicalRequirements: z.array(z.string().max(200)).max(6).default([]),
  notes: z.array(z.string().max(300)).max(6).default([]),
});
Post-zod semantic validation. The service does this; the model's word is never final.

Portion keys are unique.
Every dependsOn refers to an earlier portion (no cycles, no forward references).
minMinutes ≤ sum(stage minutes) ≤ maxMinutes.
afterPortionKey exists or is null.
Each contentAnchor must appear in the chapter text. Compare after normalising both sides (lowercase, collapse whitespace, strip punctuation). Unmatched anchors are an error once more than 25% of portions fail; otherwise they become warnings ANCHOR_NOT_FOUND.
Total minutes must fall within [0.4×, 2.5×] of the heuristic estimate; outside that range, add the warning ESTIMATE_OUTLIER.
Wrap with a zod spec test.

8.3 PlannerChapterAnalysisService.analyze(ctx)
ctx = { schoolId, userId, plannerChapter, chapterText, gradeLevel, classLabel, subjectName, periodMinutes, activityCount, activitiesEnabled }

Content missing (contentStatus MISSING or chapter deleted): return { analysis: heuristicAnalysis(profile, null), source: 'PROVISIONAL', warnings: [CHAPTER_CONTENT_MISSING] }. Never call the AI and never claim content was analysed.
Cache lookup: plannerChapter.findFirst({ where: { libraryBookChapterId, contentHash, analysisSource: 'AI', version: { schoolId } }, orderBy: { analyzedAt: 'desc' } }). Reuse the analysis if analysis.meta.promptVersion === PLANNER_PROMPT_VERSION, analysis.meta.gradeLevel === gradeLevel and periodMinutes is equal. Skip when force.
Chunking: if chapterText.length > PLANNER_ANALYSIS_MAX_CHARS (env, default 24000):
split publishedText on blank-line boundaries into segments of ≤ 20000 characters;
send exercises text truncated to 6000 characters, plus a deterministic exercise count computed with the regex /^\s*(\(?\d{1,3}[\).]|Q\.?\s*\d+|[ivx]{1,4}\))/gim;
analyse each segment, prefixing its portion keys s{n}p{k};
merge deterministically: concatenate portions in order, make the first portion of segment n depend on the last portion of n−1, take the first 12 unique objectives, sum minutes, and keep the first activityCount suggestions.
AI call using the AIRequest pattern with type: PLANNER_CHAPTER_ANALYSIS. Metadata is { plannerChapterId, contentHash, promptVersion, chars, segments }. Never store chapter text or raw model output in metadata or logs.
Run parseModelJson, then zod, then semantic validation. On failure, retry once, appending to the user prompt: Your previous JSON failed validation: <first 5 issues>. Return corrected JSON only.
If it still fails, or the provider throws: return the heuristic analysis with source: 'PROVISIONAL' and the warning AI_OUTPUT_INVALID or AI_UNAVAILABLE. Mark the AIRequest FAILED. Do not throw a 502 here; the planner must stay usable.
Stamp analysis.meta = { promptVersion, gradeLevel, periodMinutes, model, provider, analyzedAt }.
Prompt (PLANNER_CHAPTER_ANALYSIS_SYSTEM_PROMPT). The model is an experienced Pakistani school teacher planning lessons for a given class level and subject. Rules:

Use ONLY the supplied chapter text.
Return the JSON schema exactly.
contentAnchor must be a verbatim quote of 8–120 characters copied from the text.
Integer minutes per period length {periodMinutes}.
Follow the subject-profile guidance block (from subject-profiles.ts).
Order portions in teaching order.
Suggest exactly {activityCount} activities if activities are enabled, else [].
Do not invent page numbers, exercises or content not present.
No markdown.
The user prompt carries the class label, subject, grade level, chapter title, the text between explicit delimiters, and the exercise count.

8.4 Subject profiles and heuristics (subject-profiles.ts)
detectSubjectProfile(subjectName) uses case-insensitive regexes, checked in this order. Do not use isMathSubject, because it also matches science.

Profile	Match	Typical stage flow (share of chapter time)	Exercise minutes per question
ISLAMIAT_QURAN
islam|islamiyat|islamiat|nazra|nazira|qaida|quran|قرآن|اسلام
RECITATION 30, EXPLANATION 30, DISCUSSION 20, WRITTEN_EXERCISES 20
3
URDU
urdu|اردو
READING 25, VOCABULARY 15, COMPREHENSION 20, GRAMMAR 15, WRITTEN_EXERCISES 25
4
SINDHI
sindhi|سنڌي
same as URDU
4
ENGLISH
english
VOCABULARY 15, READING 20, COMPREHENSION 20, GRAMMAR 20, WRITTEN_EXERCISES 25
3
MATHEMATICS
math|ریاضی|numeracy|arithmetic
INTRODUCTION 10, EXPLANATION 20, WORKED_EXAMPLES 25, GUIDED_PRACTICE 20, INDEPENDENT_PRACTICE 25
5
SCIENCE
science|physics|chemistry|biology
INTRODUCTION 10, EXPLANATION 35, PRACTICAL_DEMONSTRATION 15 (only with practicals), DISCUSSION 10, WRITTEN_EXERCISES 30
4
SOCIAL_STUDIES
social|\bsst\b|pak.?studies|history|geography
READING 25, EXPLANATION 30, DISCUSSION 20, WRITTEN_EXERCISES 25
3
COMPUTER
computer|ict
EXPLANATION 40, PRACTICAL_DEMONSTRATION 40, WRITTEN_EXERCISES 20
3
GENERAL
fallback
INTRODUCTION 10, EXPLANATION 50, DISCUSSION 15, WRITTEN_EXERCISES 25
3
Heuristic analysis (also used as the provider mock):

words = count words in publishedText.
teachMinutes = clamp(round(words / 18), 20, 600).
exerciseMinutes = exerciseCount × perQuestion.
If content is missing: teachMinutes = 4 × periodMinutes, exerciseMinutes = 2 × periodMinutes, with the warning flag.
Split into portions of at most 2 periods each, following the profile flow. Each depends on the previous one.
The practice stages (GUIDED_PRACTICE, INDEPENDENT_PRACTICE, WRITTEN_EXERCISES) are compressible, with a compression floor of 70% of their minutes.
Also export profileGuidanceText(profile), which the prompt uses.

8.5 Teaching help (ai/schemas/teaching-help.schema.ts, services/teaching-help.service.ts)
Schema:

{
  introduction: string;
  explanationSteps: string[1..8];
  examples: string[0..5];
  questionsToAsk: string[1..8];
  optionalActivity: { title; steps: string[1..6]; minutes } | null;
  misconceptions: string[0..5];
  understandingChecks: string[1..5];
}
Input: the lesson's objectives and stages, plus a content excerpt. The excerpt is the chapter text window around the lesson's portion contentAnchors, up to 6000 characters.

basis is set by the server: 'CHAPTER_TEXT' when an excerpt was supplied, otherwise 'OBJECTIVES_ONLY'. In the OBJECTIVES_ONLY case the UI displays "Based on lesson objectives only. Chapter text was unavailable."

Caching and limits:

Cache in MemoryCacheService under planner-help:${schoolId}:${versionId}:${lessonKey}:${contentHash} for 24h.
Rate-limit with @Throttle (check how ThrottlerModule is configured in app.module.ts and follow its decorator usage), at most 10 per minute per user.
Logging: AIRequest type TEACHING_ASSISTANCE.

This service must not write to any planner, lesson or record table. A unit test asserts that the prisma mock received no write calls.

8.6 Timetable extraction (ai/schemas/timetable-extraction.schema.ts)
Schema:

{
  classLabel: string | null;
  rows: [{
    weekday: 'MONDAY'..'FRIDAY';
    periodLabel: string;
    periodNumber: number | null;
    startTime: 'HH:MM' | null;
    endTime: 'HH:MM' | null;
    kind: 'LESSON' | 'BREAK' | 'OTHER';
    subjectText: string | null;
    teacherText: string | null;
    roomText: string | null;
  }] (≤ 80);
  notes: string[];
}
Matching is deterministic. The AI returns raw text only; timetable-matching.ts maps it to subjects and teachers. Do not send the school's teacher list to the model.

Logging: AIRequest type TIMETABLE_EXTRACTION. The ocrText is stored on TimetableImport.extractedText (school-scoped, admin-only).

Failure handling: when AI is unavailable or extraction yields nothing, set the import to FAILED with a message telling the user to enter the timetable manually, and offer an empty draft. A failed AI step must never publish anything.

8.7 Cost and latency controls
One call per chapter, triggered by the portal.
The editor runs a sequential loop over unanalysed chapters, showing AiWait kind="planner" with "Chapter 2 of 6".
Per-request timeout comes from the env var.
Cache by content hash.
Chapter cap of 40 per planner.
Teaching-help cache and throttle (§8.5).
No background jobs.
9. Scheduling algorithm (schedule-engine.ts, pure)
9.1 Teaching slots
buildTeachingSlots(input):
  input: { startDate, lastTeachingDate, sectionId, gradeHasPeriodTimetable, subjectId,
           workingDayFn(date) -> { working, timetableWeekday, reason },
           periodsForDate(date) -> TimetablePeriod[] (resolved effective version or legacy),
           fallback?: { periodsPerWeek, periodMinutes } }
  slots = []
  for date in [startDate .. lastTeachingDate]:
    wd = workingDayFn(date); if !wd.working or wd.timetableWeekday == null: continue
    if gradeHasPeriodTimetable:
      periods = periodsForDate(date).filter(p => p.kind == LESSON && p.subjectId == subjectId && p.startTime && p.endTime)
      for p in periods sorted by startTime: slots.push({ date, periodNumber: p.periodNumber, startTime, endTime, minutes: hm(end)-hm(start) })
    else:
      // class-teacher pattern (Grade.hasPeriodTimetable=false): one daily slot, periodNumber 0
      slots.push({ date, periodNumber: 0, minutes: fallback?.periodMinutes ?? 40, startTime: null, endTime: null })
  if slots.empty and gradeHasPeriodTimetable:
    if !fallback: throw TIMETABLE_REQUIRED (details: { sectionId, subjectId })
    // explicit teacher-entered assumption, distribute across Mon..Fri round-robin, periodNumber 1..k
    slots = synthesize(fallback) and mark summary.timetableSource='FALLBACK' + warning TIMETABLE_ASSUMED
  return slots (sorted by date, startTime, periodNumber)
9.2 Segments and revision buffer
revisionSlots = settings.revisionSlots ?? clamp(round(slots.length * 0.10), 1, 6)
teachingSlots = slots[0 .. len - revisionSlots); revisionSlotsList = tail
buildSegments(chapters in sortOrder where included, activities):
  for chapter: for portion in analysis.portions (order):
      for stage in portion.stages: seg { chapterKey, portionKey, stage, minutes, required: chapter.required, compressible: portion.compressible, floorMinutes: compressible ? ceil(minutes*0.7) : minutes }
      if chapter.activitiesEnabled: append activities with afterPortionKey == portion.portionKey as ACTIVITY segments (optional=true)
    append activities with afterPortionKey == null at chapter end
    if analysis.assessmentMinutes > 0: append ASSESSMENT segment
9.3 Packing (sequential, in order, with splitting)
pack(segments, slots, frozenLessons, opts):
  occupied = set of (date, period) from frozenLessons; cursor = first slot not occupied
  lessons = [...frozenLessons]; current = newLesson(slot[cursor])
  for seg in segments:
    remaining = seg.minutes
    while remaining > 0:
      if cursor == end: overflow.push({ ...seg, minutes: remaining }); break   // never drop
      free = slot.minutes - used(current)
      if seg starts a new chapter and used(current) > 0 and free < opts.minChapterStartMinutes: close current; advance; continue
      take = min(free, remaining); append stage {stage, minutes: take, portionKey, part, partCount}
      remaining -= take; if free - take == 0: close current; advance cursor (skip occupied)
  close current
  overflow segments -> lessons with scheduledDate=null (kind per segment), grouped up to opts.fallbackMinutes each
  dependsOnKeys: each lesson depends on the lesson containing the previous portion of the same chapter (and the cross-chapter predecessor for portion.dependsOn)
  primaryStage = stage with max minutes in lesson; kind = ACTIVITY if all segments are activity, ASSESSMENT if any assessment, else TEACHING
  title = `${chapter.title}: ${portion.title}` (+ " (part i of n)")
  revision lessons: fill revisionSlotsList with REVISION lessons, chapters round-robin weighted by teaching minutes
  return { lessons, overflow }
9.4 Lesson key stability
When re-packing, a new lesson inherits the lessonKey of the old lesson whose first segment signature (portionKey|activityKey|stage|part) matches. Otherwise it gets a new randomUUID() (inject a keyFactory for tests). Frozen lessons keep their keys and slots.

9.5 Edit operations
Hard constraints: working day; slot exists in buildTeachingSlots; slot capacity; date ≤ lastTeachingDate; dependencies satisfied (a lesson's slot is after all its dependsOnKeys); frozen lessons are immutable; required content retained; one lesson per slot. Everything else (stage order preferences, the minimum-chapter-start rule) is soft and only produces warnings.

moveLesson(state, slots, lessonKey, target, 'SINGLE')

The target must be in slots, otherwise SLOT_NOT_AVAILABLE (with the reason: holiday, no period, after the cutoff).
The target must be free, otherwise SLOT_OCCUPIED (with details naming the occupying lessonKey).
The lesson must not be frozen, otherwise FROZEN_LESSON.
Moving must not place it before a dependency or after a dependent, otherwise DEPENDENCY_VIOLATION (details list { lessonKey, dependsOn, conflictDate }).
The vacated slot stays empty and slack is reported. Nothing else moves.
moveLesson(..., 'WITH_FOLLOWING')

Take the moved lesson and every later non-frozen lesson by sequence.
Re-pack their segments starting at the target slot, in one forward pass over the precomputed slot list. Frozen lessons and slots before the target are fixed points.
Lessons that no longer fit go to unscheduled. This cannot cascade endlessly: one pass, bounded by slots.length.
The target must be ≥ the slot of the moved lesson's last dependency.
reorderLessons(chapterKey, lessonKeys)

Build a new order, check it is a topological order of dependsOnKeys (else DEPENDENCY_VIOLATION), then re-pack from the earliest affected slot.
updateLessonStages(lessonKey, stages)

Validate that the stages' portions belong to that lesson.
If the sum exceeds slot minutes, the excess spills forward: re-pack from this lesson onward.
If it is shorter, the slack is pulled back only when the lesson is in the same chapter. Then re-pack forward.
Activity toggle, count or delete

Rebuild segments.
Run a coverage assertion: the set of portionKeys across all lessons (scheduled + unscheduled) before and after the operation must be identical for non-activity segments, otherwise throw COVERAGE_VIOLATION. This is a server bug guard.
Re-pack from the first affected lesson.
generate

Run buildSegments then pack over all slots from startDate, with frozen = [] for INITIAL versions.
9.6 Feasibility
requiredMinutes = sum(minutes of required segments) ; capacity = sum(teachingSlots.minutes)
feasibility = overflow has required segments ? 'INFEASIBLE'
            : slackSlots < 2 ? 'AT_RISK' : 'FEASIBLE'
shortfallMinutes = max(0, sum(overflow required minutes))
alternatives (computed, never applied automatically):
  USE_REVISION_BUFFER if revisionSlots minutes >= shortfall (recoversMinutes)
  COMPRESS_PRACTICE: sum(minutes - floorMinutes) of compressible segments
  DROP_OPTIONAL_ACTIVITIES: sum(optional activity minutes)
  ADD_PERIODS: shortfall / avgSlotMinutes periods
  LATER_EXAM_DATE: earliestFeasibleExamDate = extend workingDayFn beyond lastTeachingDate until capacity covers requiredMinutes + revision (suggestion only; exam date unchanged)
predictedCompletionDate = date of the last scheduled required TEACHING/ACTIVITY/ASSESSMENT lesson
Risk mapping for examRisk: FEASIBLE with slack ≥ 4 is NONE; FEASIBLE otherwise is LOW; AT_RISK is MEDIUM; INFEASIBLE is HIGH.

10. Planner and timetable workflows
10.1 Working days (school-calendar.ts, pure)
isWorkingDay(dateIso, ctx: { tz, section: { id, gradeId, branchId }, calendarDays: SchoolCalendarDay[], holidayEvents: Event[] }):
  candidates = []
  for d in calendarDays where d.date == dateIso and d.scopeKey in ['SECTION:'+sid, 'GRADE:'+gid, 'ALL']: candidates.push({ specificity: 3|2|1, source:'CAL', kind, followsWeekday, reason })
  for e in holidayEvents (type HOLIDAY) where zonedDateIso(e.startDate,tz) <= dateIso <= zonedDateIso(e.endDate,tz)
       and audience matches (SECTION: e.sectionId==sid; GRADE: e.gradeId==gid; BRANCH: e.branchId==branchId; ALL_SCHOOL): candidates.push({ specificity: SECTION 3 | GRADE 2 | BRANCH 1 | ALL 1, source:'EVENT', kind: NON_WORKING, reason: e.title })
  pick max specificity; tie -> CAL beats EVENT
  if picked: kind==WORKING -> { working:true, timetableWeekday: followsWeekday ?? weekdayOf(dateIso) (null if weekend w/o followsWeekday), reason }
             else -> { working:false, reason }
  default: Mon..Fri -> working with its weekday; Sat/Sun -> { working:false, reason:'Weekend' }
weekdayOf uses dateFromIso(iso).getUTCDay(). Load the timezone from SchoolSettings.timezone, falling back to DEFAULT_SCHOOL_TIMEZONE.

10.2 Planner lifecycle (the UI flow)
Create (form): choose a class-subject (teacher: from teachersService.myClasses; head teacher: plus supervised sections; principal: any). Choose the teacher, exam type and date (prefilled from the matching ExamConfig when it has a startDate), the book (suggested), and the chapters (checklist, ordered).
Analyse: sequential per-chapter analysis with progress. PROVISIONAL chapters are clearly badged.
Generate the schedule. Show the feasibility banner: FEASIBLE (green), AT_RISK (amber), or INFEASIBLE (red, with the alternatives list and the unscheduled lessons tray).
Edit: drag and drop, Move dialog, reorder, stage minutes, activity toggles and CRUD. Every response refreshes the single payload.
Submit (teacher or head teacher), or Publish directly (principal-created).
Review: the principal approves, rejects or requests changes.
Published: the approved version drives my-day and rounds.
Revision or recovery: create a draft from the approved version, edit or generate, then submit and approve, which supersedes the old version.
11. Approval and versioning rules (planner-status.ts + PlannerApprovalService)
11.1 Version transitions
From	Action	To	Actor
DRAFT
submit
SUBMITTED
creator, assigned teacher, or head teacher of the section
CHANGES_REQUESTED
submit
SUBMITTED
same
SUBMITTED
withdraw
DRAFT
the submitter
SUBMITTED
approve
APPROVED
principal or admin, and not the submitter (SELF_APPROVAL_FORBIDDEN)
SUBMITTED
reject
REJECTED
principal or admin; comment required
SUBMITTED
request-changes
CHANGES_REQUESTED
principal or admin; comment required
DRAFT
publish (direct)
APPROVED
principal or admin who created the version; it was never submitted
APPROVED
another version approved
SUPERSEDED
system
Editable states are DRAFT and CHANGES_REQUESTED only.
APPROVED, SUPERSEDED, REJECTED and WITHDRAWN are immutable. WITHDRAWN is unused: withdraw returns the version to DRAFT and records a WITHDRAWN approval event.
11.2 Planner status derivation
Recompute the planner status inside the same transaction:

No approvedVersionId → the working version's status maps directly (DRAFT, SUBMITTED, CHANGES_REQUESTED, REJECTED).
approvedVersionId set:
PUBLISHED, unless the working version is SUBMITTED, in which case REVISION_PENDING;
COMPLETED or ARCHIVED when those actions have been taken.
11.3 Transaction contracts
submit(actor, plannerId, versionId, { expectedRevision, acknowledgeRisk, note })

Compare-and-set the version: updateMany({ where: { id, revision: expectedRevision, status: { in: ['DRAFT','CHANGES_REQUESTED'] } }, data: { status: 'SUBMITTED', submittedById, submittedAt, revision: { increment: 1 } } }). A count of 0 → PLANNER_VERSION_CONFLICT.
Require that the summary exists (otherwise CHAPTER_NOT_ANALYZED) and that there are no lessons pending generation.
If summary.feasibility != 'FEASIBLE' and !acknowledgeRisk → RISK_ACKNOWLEDGEMENT_REQUIRED.
Create a PlannerApprovalEvent (SUBMITTED) and update the planner status with a lockRevision compare-and-set.
After commit, notify every PRINCIPAL user of the school (UserRole with the PRINCIPAL role and the matching schoolId). If there are none, notify SCHOOL_ADMIN users. Use PLANNER_SUBMITTED, or SCHEDULE_CHANGE_SUBMITTED when the origin is RECOVERY. Audit PLANNER_SUBMITTED.
approve(actor, plannerId, versionId, { expectedRevision, comment })

Load the planner (school-scoped). assertCanDecide.
Compare-and-set the version: updateMany({ where: { id, status: 'SUBMITTED', revision: expectedRevision }, data: { status: 'APPROVED', decidedById, decidedAt, decisionComment, revision: { increment: 1 } } }). If the count is 0, re-read: status ≠ SUBMITTED → ALREADY_DECIDED; otherwise PLANNER_VERSION_CONFLICT.
If version.basedOnVersionId !== planner.approvedVersionId (for REVISION and RECOVERY) → throw BASELINE_CHANGED, which rolls back.
Compare-and-set the planner: updateMany({ where: { id, lockRevision: planner.lockRevision }, data: { approvedVersionId: version.id, workingVersionId: null, status: 'PUBLISHED', lockRevision: { increment: 1 } } }). Count 0 → PLANNER_VERSION_CONFLICT.
Set the previous approved version to SUPERSEDED.
Mark the lessons of the new version frozen if their date is before today. This is a convenience flag only; teaching records keep their own plannerVersionId.
Create a PlannerApprovalEvent (APPROVED).
After commit: audit PLANNER_APPROVED, and notify the creator and the assigned teacher (PLANNER_DECISION or SCHEDULE_CHANGE_DECISION).
reject and requestChanges

Same compare-and-set on the version. A comment is required (3–2000 characters after trimming), otherwise COMMENT_REQUIRED.
Reject clears workingVersionId.
Request-changes keeps workingVersionId.
The official approved version stays unchanged in both cases.
publishDirect

Allowed only if actor.isPrincipalOrAdmin && version.createdById === actor.userId && version.status === 'DRAFT'.
Same steps as approve, with action PUBLISHED_DIRECTLY, and the actor recorded as the decider. This is not self-approval of a submission; it is an author with approving authority publishing their own plan. That is why it is a separate, explicitly audited action.
createRevision and createRecovery

Compare-and-set the planner where { id, lockRevision, workingVersionId: null }, otherwise WORKING_VERSION_EXISTS.
Copy the base version's chapters (same chapterKeys), activities and lessons (same lessonKeys).
Set versionNumber = max + 1 and basedOnVersionId = base.id.
Set workingVersionId.
Approval event REVISION_STARTED or RECOVERY_PROPOSED.
11.4 Concurrency guarantees, tested in §17
Two simultaneous edits with the same expectedRevision: exactly one succeeds, the other gets 409.
Two simultaneous approvals: one 200 and one 409 ALREADY_DECIDED.
An approval racing a withdraw: one wins.
A teacher editing while the principal approves: the version is SUBMITTED, so the edit gets VERSION_NOT_EDITABLE.
12. Timetable upload and management, and classroom-round behaviour
12.1 Upload flow
Upload → Extract → Review and correct → Validate → Publish.

The admin UI never publishes automatically. OCR or AI drafts always require the explicit publish dialog.

12.2 CSV parser (timetable-csv.ts)
Implement an RFC 4180 tokenizer by hand: quoted fields, "" escapes, newlines inside quotes, CRLF. Do not add a dependency.

Find the header row: the first row whose cells (trimmed, uppercased) include PERIOD and at least three of MONDAY to FRIDAY. An optional TIME column may follow PERIOD.
Rows above the header supply class-label candidates, e.g. "THE PIERCING STARS" / "CLASS I" or "CLASS 7 WEEKLY TIME TABLE". Extract the class with parseClassNumber plus roman numerals I–XII.
Data rows:
The period label is 1, 1st Period, Period 1 and similar; parse the number.
An empty period label combined with cells like BREAK TIME, BREAK, RECESS or LUNCH produces a BREAK row.
The time is 8:00 - 8:45, also 8:00-8:45 or 8:00 AM - 8:45 AM; normalise to 24-hour HH:MM. School hours are assumed 07:00–17:00, so 1:30 becomes 13:30 when it falls after a morning start.
Cells: split on the first newline into subject text and teacher text. If there is no newline, the whole cell is the subject text.
Footer rows (Class Teacher, Working Days, Friday Timing, or any row after the last numbered period whose first cell is not a period) go to meta. Friday Timing, 8:00 AM - 12:00 PM is a warning FRIDAY_TIMING_NOTE; the admin adjusts Friday times in the grid. Do not auto-shift times.
Output { classLabel, rows: ExtractedRow[], meta, warnings }, the same shape as AI extraction.
Unit-test it against fixtures copied as inline strings from data/Class_One_Time_Table_2026_27.csv (with a TIME column) and the Class 7 file (no TIME column, "Subject\nTeacher" cells). Do not read data/ at test time.

12.3 Matching (timetable-matching.ts)
Subjects: normalise (lowercase, strip punctuation). Try an exact match on name or code, then an alias map (sst → social studies, math/maths → mathematics, islamiyat/islamiat → islamiat, computer → computer science/computer, gk → general knowledge, nazra/qaida → quran/nazra), then a startsWith match. Zero matches → UNKNOWN_SUBJECT; several → AMBIGUOUS_SUBJECT.
Teachers: strip the honorifics sir|miss|mr|mrs|ms|madam|muallima|ustad|ustaz|maam. Match against firstName, firstName lastName, and teacherDisplayName output, restricted to active teacher profiles of the school. Use the honorific to break gender ties. Zero → UNKNOWN_TEACHER; several → AMBIGUOUS_TEACHER.
Class to section: grade by class number, then the grade's sections. Exactly one → assign it. Several → SECTION_SELECTION_REQUIRED. None → UNKNOWN_CLASS.
12.4 Validation (timetable-validation.ts)
Each issue is { code, severity: 'BLOCKING' | 'WARNING', weekday?, periodNumber?, message, relatedVersionId? }.

Blocking

MISSING_SECTION
INVALID_TIME (unparseable, or end ≤ start)
MISSING_TIMES (a LESSON without a start or end)
SECTION_OVERLAP (two periods of the same section and weekday whose times overlap)
DUPLICATE_PERIOD (same weekday and periodNumber twice)
UNKNOWN_SUBJECT or AMBIGUOUS_SUBJECT on a LESSON
TEACHER_DOUBLE_BOOKED: the same teacherId, same weekday, overlapping times, in another section's version that is PUBLISHED and overlaps the effective range, or in another draft in the same publish batch
Warnings

UNKNOWN_TEACHER (a period may have no teacher)
MISSING_PERIOD (a gap in period numbers)
SUBJECT_NOT_IN_CLASS (no ClassSubject for that section and subject this year)
TEACHER_NOT_ASSIGNED_TO_SUBJECT (the ClassSubject teacher differs)
FRIDAY_TIMING_NOTE
NO_LESSONS_ON_DAY
12.5 Publish and effective dating
All of this happens in one transaction.

Every item must be DRAFT, compare-and-set on revision, with no blocking issues after re-validating at publish time (never trust a stale report).
effectiveFrom must be ≥ the year's start date and ≤ its end date.
For each section, effectiveFrom must be strictly later than every existing PUBLISHED or SUPERSEDED version's effectiveFrom for that section (append-only timeline), otherwise TIMETABLE_EFFECTIVE_DATE_INVALID.
Set the previous latest version's effectiveTo = effectiveFrom − 1 day and its status to SUPERSEDED. Set the new version to PUBLISHED with versionNumber = max + 1.
A temporary timetable (for example Ramadan) is a normal publish; returning to normal is "Clone & publish" of the earlier version with a later effectiveFrom.
Affected planners: list approved planners in these sections whose future lessons (date ≥ effectiveFrom) no longer match a LESSON period of their subject (same date, periodNumber, subjectId). Return them in affectedPlanners, notify their teachers, and show a "Timetable changed – recovery suggested" banner on those planners (computed at read time). Never modify approved planners.
12.6 Resolver
effectiveVersion(sectionId, date):

the latest version with status PUBLISHED or SUPERSEDED, effectiveFrom ≤ date, and effectiveTo null or ≥ date;
otherwise, if there are no versions at all for that section, the legacy TimetableSlot rows for the current year (source: 'LEGACY');
otherwise NONE.
13. Classroom rounds, daily teaching
13.1 Rounds (rounds-resolver.ts + ClassroomRoundsService.now)
Inputs: at (defaults to new Date()), the school timezone, and the observer scope.

dateIso = zonedDateIso(at, tz), nowMin = zonedMinutes(at, tz).
For each section in scope, ordered by grade level then section name:

If isWorkingDay is false → state CLOSED with the reason.
If the grade is a class-teacher pattern → state CLASS_TEACHER_DAY: show the class teacher, today's planned lessons of all planners for the section (periodNumber 0), and any records.
Load the periods for the date. If there are none → state NO_TIMETABLE.
Find the current period: start ≤ nowMin < end.
If it is a BREAK → BREAK.
If there is no current period: before the first period → BEFORE_SCHOOL (show the next period); after the last → AFTER_SCHOOL; otherwise → BETWEEN_PERIODS (show the next).
For a LESSON period, show:
the period teacher (TimetablePeriod.teacherId);
planner = the non-archived planner(s) for (section, subject) whose [startDate, examDate] contains the date and that has an approved version. More than one gives the flag PLANNER_CONFLICT. None gives "No approved planner".
the planned lesson from the approved version at (date, periodNumber). If there is none: "No planned lesson for this period." Never infer one.
TeachingRecord at (planner, date, periodNumber);
the latest observation for (section, date, periodNumber);
TeacherAttendance for the teacher and date.
Display status (pure function):
record COMPLETED → COMPLETED
PARTIAL → PARTIALLY_COMPLETED
DIFFERENT_LESSON → DIFFERENT_LESSON
NOT_TAUGHT → NOT_TAUGHT
IN_PROGRESS → IN_PROGRESS
CONFIRMED → TEACHER_CONFIRMED
no record and the period has ended → NOT_YET_REPORTED
no record and the period is ongoing → SCHEDULED
NEEDS_ATTENTION overrides when: teacher attendance is absent or not checked in by period start, the latest observation's match is DIFFERENT_LESSON or NO_LESSON_OBSERVED, there is a PLANNER_CONFLICT, or the period has a teacher missing from the timetable.
Always return both the base status and the attentionReasons[].
RoundsPayload:

{
  at: string;
  date: string;
  timezone: string;
  sections: Array<{
    section: { id, label },
    state,
    period?: { periodNumber, startTime, endTime, subject, teacher },
    nextPeriod?,
    planner?: { id, title },
    plannedLesson?: { lessonKey, title, primaryStage, objectives, chapterTitle } | null,
    record?: { status, updatedAt },
    lastObservation?: { match, observedAt },
    teacherPresence: 'PRESENT' | 'LATE' | 'ABSENT' | 'NOT_CHECKED_IN' | 'UNKNOWN',
    displayStatus,
    attentionReasons: string[],
  }>
}
13.2 My day (TeachingRecordsService.myDay(user, date))
The teacher profile comes from user.id and schoolId.
Collect slots where the teacher teaches on that date:
resolved periods with teacherId = me, for every section in the school whose effective version contains the date (query TimetablePeriod joined to the effective versions);
legacy slots;
class-teacher-pattern sections where classTeacherId = me.
For each slot, attach the approved-planner lesson exactly as in rounds step 6, plus the existing record.
Also list "unplanned periods" (periods with no planner or lesson) as information only.
Add pendingReports: due lessons (slot ended) from my planners in the last 14 days with no record.
13.3 Upsert teaching record
UpsertTeachingRecordDto {
  date,
  periodNumber (int ≥ 0),
  status: TeachingRecordStatus,
  actualLessons: [{ lessonKey, outcome: 'COMPLETED' | 'PARTIAL', completedStageIndexes?: number[] }] (≤ 5),
  actualLibraryChapterId?,
  completedPortionNote?, unfinishedPortionNote?,
  actualMinutes? (1..300),
  notes? (≤ 2000)
}
Rules

Who may record: the planner's assigned teacher, or the timetable teacher of that (section, date, period). A head teacher may record only on behalf of the class teacher with notes required. Principals do not record.
Dates:
Future dates are forbidden (RECORD_FUTURE_DATE).
Today's not-yet-started period may only be CONFIRMED.
COMPLETED, PARTIAL, NOT_TAUGHT, DIFFERENT_LESSON and DELAYED require that the period has started.
Records older than 14 days set lateReport = true.
Planner state: the planner must have an approved version, otherwise RECORD_PLANNER_NOT_PUBLISHED. Snapshot plannerVersionId = planner.approvedVersionId and plannedLessonKey (the lesson at that slot in that version, or null).
Lesson keys: every actualLessons[].lessonKey must exist in the approved version, otherwise RECORD_LESSON_INVALID.
COMPLETED requires at least one entry.
PARTIAL requires at least one PARTIAL entry plus an unfinishedPortionNote.
DIFFERENT_LESSON requires actualLessons or actualLibraryChapterId; the chapter must be in a granted book.
NOT_TAUGHT requires notes and an empty actualLessons.
Write: upsert by (plannerId, date, periodNumber) inside a transaction. Audit TEACHING_RECORD_CREATED or TEACHING_RECORD_UPDATED, with the previous values in metadata.before.
Never touch planner tables. Planner version changes never touch records.
Partial teaching feeds progress (§16) and recovery (§14). The unfinished stage segments of a PARTIAL lesson become continuation segments.

14. Schedule recovery (recovery-engine.ts + PlannerRecoveryService)
propose(baseline: approved version state, records, slots(from today), options):
  today = zonedDateIso(now, tz)
  frozen = baseline lessons with date < today  OR (date == today AND slot ended)  -> keep exact slot, frozen=true
  coverage per lessonKey from records: COMPLETED | PARTIAL(stage indexes done) | NOT_TAUGHT | UNREPORTED
  outstanding = []
  for lesson in frozen (sequence order):
    if COMPLETED: continue
    if PARTIAL: outstanding += remaining stage segments (isContinuation=true)
    if NOT_TAUGHT: outstanding += all segments (isContinuation=true)
    if UNREPORTED: outstanding += all segments, flagged 'UNREPORTED_ASSUMED_NOT_TAUGHT' (warning shown to approver)
  futureSegments = segments of baseline lessons with date >= today (in order)
  segments = outstanding (in original order) ++ futureSegments
  revisionSlots = settings.revisionSlots
  result = pack(segments, slotsFromToday minus revision tail, frozen=[]) 
  if no required overflow: strategy S1 'SLACK' (absorbed by free slots)
  else if options.allowBufferUse: reduce revision slots down to settings.minRevisionSlots, repack -> S2 'BUFFER'
  if still overflow and options.allowCompression: compress compressible segments toward floorMinutes proportionally, repack -> S3 'COMPRESSION'
  if still overflow and options.allowActivityRemoval: drop optional ACTIVITY segments (flag each), repack -> S4 'ACTIVITY_REMOVAL'
  if still overflow: S5 'INFEASIBLE' -> keep overflow as unscheduled lessons, compute alternatives incl. earliestFeasibleExamDate (suggestion only)
  impact = diff(baseline future lessons, proposal future lessons) by lessonKey:
     moved: [{ lessonKey, title, from:{date,period}, to:{date,period}|null }], added (continuations), removed (activities dropped), compressed: [{lessonKey, beforeMinutes, afterMinutes}],
     revisionSlotsBefore/After, predictedCompletionBefore/After, examRisk, strategyApplied, unreportedAssumed: lessonKey[]
  return { lessons: frozen ++ result.lessons, summary, impact, examRisk }
Service steps

Require the planner to be PUBLISHED with no working version.
Run the transaction from §11.3 createRecovery, then replace the copied lessons with the proposal (frozen lessons keep their keys).
Store changeReason, changeReasonNote, impact, summary, examRisk.
If the proposal is identical to the baseline (no outstanding segments and no timetable change) → RECOVERY_NOT_NEEDED, and roll back.
Rules

The draft is editable like any draft.
The baseline stays official until approval.
Approval supersedes the baseline. Teaching records keep their plannerVersionId references.
The exam date is never changed.
Required content is never removed. Dropping activities only happens with the explicit option, and each dropped activity is listed in impact.removed.
15. Frontend
15.1 Data and state
Services use the apiClient patterns:

academicPlannerService: one method per route in §6.4, using timeoutMs: 120_000 for analyse, generate and recovery.
timetablesService: uses apiForm for uploads.
classroomRoundsService.
Export the payload types from these service files.

Single source of truth: the TanStack Query key ['planner-version', plannerId, versionId].

Every mutation response is a full PlannerVersionPayload; apply it with queryClient.setQueryData, then invalidate ['planner', plannerId] and ['planners'].
The calendar, timeline and outline views derive from that payload through lib/planner-view-model.ts: toCalendarWeeks, toTimeline, toOutline, findLesson, canDropAt(lesson, slot).
No component keeps its own copy of lesson state. The only local state allowed is transient drag-hover state.
Conflicts:

PLANNER_VERSION_CONFLICT: toast "This plan was changed elsewhere. Showing the latest version.", then refetch. Drop any pending operation.
ALREADY_DECIDED: toast plus refetch.
Dates: handle as strings with helpers; never new Date('YYYY-MM-DD') local-time arithmetic.

15.2 Planner workspace (planner-workspace.tsx)
Used by /teacher/planner/[plannerId] and /school/planner/[plannerId].

Header: PageHeader with class, subject, exam type and date, the teacher, a status Badge, a version selector (approved / working / history), and planner-status-banner.tsx (feasibility, risk, content-changed and timetable-changed banners, rejection or changes-requested comments).
Tabs (components/ui/tabs.tsx): Calendar | Timeline | Outline.
Calendar: a week grid (Mon–Fri plus extra working days) whose cells are the subject's slots. Holidays are greyed with the reason. Revision slots are tinted. After the cutoff is hatched. LessonCard shows title, stage icon, minutes, a frozen lock, and a continuation tag.
Timeline: a vertical list by date, with chapter colour bands and an unscheduled tray at the end.
Outline: chapter → lessons tree with stage breakdown, reorder buttons, and per-chapter activity toggle and count (chapter-activities-panel.tsx).
Drag and drop: native HTML5 (draggable, onDragStart sets the lessonKey, onDragOver uses canDropAt to set dropEffect, onDrop).
When the dragged lesson has later lessons, dropping opens a small Dialog: "Move only this lesson" / "Move this and all following lessons".
Invalid targets show aria-disabled and a tooltip with the reason.
Accessible and touch alternative: every LessonCard has a "Move…" button opening move-lesson-dialog.tsx (date Select limited to valid slots, period Select, mode radio), and an "Edit" button opening lesson-edit-dialog.tsx (title, objectives, stage minutes, total versus slot capacity). Outline reorder uses up and down buttons with aria-label.
All actions are keyboard reachable.
HTML5 drag and drop does not work on touch screens; the Move dialog is the touch path.
Validation messages: map details.violations to readable text, e.g. "‘Fractions part 2’ depends on ‘Fractions part 1’ which is scheduled on 12 Nov".
Actions (approval-actions.tsx), driven entirely by payload.permissions: Analyse chapters, Generate schedule, Submit (opens a risk-acknowledgement checkbox when not FEASIBLE), Withdraw, Approve, Reject or Request changes (comment required), Publish, New revision, Propose recovery.
Hiding buttons is UX only; the server enforces every rule.
History: version-history.tsx lists versions and approval events. For RECOVERY versions it shows recovery-diff-table.tsx from impact.

15.3 Other screens

Teacher area

/teacher/planner: a list of my planners (status badges, risk, next lesson), the "New planner" button, and a "Pending reports" count.
/teacher/planner/new: planner-create-form.tsx (react-hook-form + zod; options from GET /academic-planners/options; book suggestion badge; chapter checklist with up/down ordering).
/teacher/planner/today: today-lessons-list.tsx with a date switcher.
Each slot shows the planned lesson (or "No planned lesson"), plus "Record" (teaching-record-dialog.tsx: status radio, lesson chips from the approved version, partial stage checkboxes, notes) and "Teaching help" (teaching-help-dialog.tsx, which shows the basis label).
"Pending reports" section.
/teacher/planner/[plannerId]/recovery: reason select, note, option toggles, Generate proposal, then the workspace in RECOVERY draft mode with the diff table and Submit.
/teacher/head/rounds and /school/planner/rounds: rounds-board.tsx.
Mobile-first: one column of round-class-card.tsx with large tap targets and a sticky header showing the time, date and a Refresh button.
refetchInterval: 60_000 and refetchOnWindowFocus.
Filter chips: All, Needs attention, Not reported.
Tapping a card opens observation-sheet.tsx (Dialog bottom-aligned on mobile): match buttons, teacher present toggle, stage select, optional lesson or chapter select, notes, follow-up fields, share toggle.
Generate clientRequestId once per sheet with crypto.randomUUID() and reuse it on retry. Show an error with retry on failure. Offline mode is not supported.
Support ?at= for testing only when process.env.NODE_ENV !== 'production'.
/teacher/head/planners: planners in supervised sections, with progress and create-for-teacher.

School area

/school/planner: the reports overview (cards plus tables: syllabus progress by section × subject, adherence, overdue, risk, open follow-ups) and the planner list.
/school/planner/approvals: tabs for New planners and Schedule changes. Rows open the workspace in review mode.
/school/timetable/manage:
timetable-upload-card.tsx (accepts .csv, .jpg, .png, .webp; tells XLSX and PDF users to save as CSV or upload a screenshot);
the imports list;
the "Adopt existing timetable" action when legacy slots exist;
versions per section with their effective ranges.
/school/timetable/imports/[importId] and /school/timetable/versions/[versionId]:
timetable-grid-editor.tsx: an editable grid of weekdays × periods; cell editor with subject and teacher Selects showing the raw text; "Apply period times to all days"; section selector for unresolved drafts.
timetable-issues-panel.tsx: blocking and warning issues; clicking one focuses the cell.
timetable-publish-dialog.tsx: effective date, a list of affected planners, and the explicit confirmation "I reviewed this timetable".
/school/setup/academic-calendar: month view of overrides and HOLIDAY events, with add/remove dialogs (scope, kind, followsWeekday for weekends).

Shared states: use PageLoader/Skeleton for loading, EmptyState for empty, friendlyApiErrorMessage for errors, and AiWait during AI calls.

16. Authorization and security; reporting

16.1 PlannerAccessService.resolveActor(user)

Returns { schoolId, userId, isAdmin (SCHOOL_ADMIN), isPrincipal (PRINCIPAL), isApprover (isAdmin || isPrincipal), teacherProfileId | null, headSectionIds: string[] }. Use resolveHeadTeacherSectionIds.

16.2 Authorization matrix

| Action | Teacher | Head teacher (own sections) | Principal / admin |
|---|---|---|---|
| Create planner | for a ClassSubject where they are teacher or assistant, or class teacher of the section; teacherId must be self | for any section in scope; teacherId must be that ClassSubject's teacher or assistant, or the class teacher | any section; same teacherId rule |
| View planner | assigned or creator | sections in scope | school |
| Edit draft | assigned or creator | in scope | creator only (they review others' plans; they do not edit them) |
| Submit or withdraw | assigned or creator | in scope | n/a (they publish directly) |
| Approve, reject, request changes | ✗ | ✗ | ✓, except their own submission |
| Recovery proposal | assigned | in scope | ✓ |
| Archive | ✗ | ✗ | ✓ |
| Teaching record | assigned teacher or that slot's timetable teacher | on behalf of others, notes required | ✗ |
| Teaching help | assigned | in scope | ✓ |
| Rounds and observations | ✗ (sees own shared observations) | in scope | school |
| Timetable and calendar writes | ✗ | ✗ | SCHOOL_ADMIN role + MANAGE_CLASSES (principals pass the role mapping; the permission check applies to them) |
| Reports | own planners | in scope | school |

16.3 Security rules

Every query includes schoolId. IDs from requests (section, subject, teacher, book, chapter, exam config, file asset, lessonKey) are checked to belong to the school or the version before use.
Library access always checks LibraryBookGrant.canRead for the school. Chapter text is returned only to the analysis and help services, never through a raw API, except the teaching-help excerpt.
The teacherId in requests is never trusted. Ownership is resolved from user.id.
DTOs bound every string length and array size. Free text is stored as plain text and rendered with React's default escaping; never use dangerouslySetInnerHTML.
Known limitation: timetable uploads stored through local storage are publicly reachable at /uploads/<uuid>, like all existing uploads (configure-app.ts). Do not return fileAsset.url to non-admins. Record this in the final report and do not change the static serving.
Logs must not contain chapter text, model output, or personal data beyond IDs.
Throttle AI endpoints (§8.5).
Rounds and my-day are excluded from the HTTP cache.

16.4 Reporting (progress-metrics.ts, PlannerReportsService)

Per-planner calculation, official version only:

due = lessons where date < today OR (date == today AND slotEnd <= nowMin)
for each due lesson: outcome = from records via actualLessons (any record with lessonKey) -> COMPLETED | PARTIAL ; else record at slot with NOT_TAUGHT -> NOT_TAUGHT ; else UNREPORTED
completedCount, partialCount, notTaughtCount, unreportedCount
adherenceRate = due ? completedCount / due : null           // future lessons are never in the denominator
overdue = due lessons not COMPLETED whose content has no later scheduled occurrence in the official version
syllabusProgress = completed required TEACHING minutes / total required TEACHING minutes (official version)
pace = completedMinutes / elapsedCapacityMinutes (null if 0)
forecastDate = summary.predictedCompletionDate if pace >= 0.95 else project remaining required minutes over future slots at observed pace
risk = max(version.examRisk, forecastDate > lastTeachingDate ? HIGH : overdueMinutes > futureSlackMinutes ? MEDIUM : NONE)

Overview aggregates by section × subject and by teacher:

pending planner approvals and pending recoveries;
planners at risk;
observation counts by match;
open follow-ups;
sections with no published timetable.

Student marks and quiz outcomes are not mixed into these metrics.

Notifications (persisted through createForUsers; FCM push only if configured), with data: { plannerId, versionId } and no deepLink (there is no portal inbox):

| Trigger | Type |
|---|---|
| Planner submitted | PLANNER_SUBMITTED |
| Planner decision | PLANNER_DECISION |
| Recovery submitted | SCHEDULE_CHANGE_SUBMITTED |
| Recovery decision | SCHEDULE_CHANGE_DECISION |
| Timetable published | TIMETABLE_PUBLISHED |
| Shared follow-up | CLASSROOM_FOLLOW_UP |

Portal pending counts come from GET /academic-planners/approvals and from pendingReports in my-day.

17. Testing strategy

17.1 Frameworks

Backend unit and integration tests: jest, backend/src/**/*.spec.ts, run with npm test (rootDir src, @/ alias). Service tests use mocked Prisma objects, following parents/day-off.service.spec.ts. For $transaction, mock it as jest.fn(async (fn) => fn(txMock)).
E2E: backend/test/academic-planner.e2e-spec.ts with supertest and test/jest-e2e.json.
The first line of beforeAll calls assertSafeTestDatabase().
The suite is skipped unless PLANNER_E2E=1 and DATABASE_URL is set (follow the skip style of app.e2e-spec.ts).
Fixtures are created in beforeAll through Prisma: two schools with codes E2E-PLN-A-<runId> and E2E-PLN-B-<runId>, plus users, sections, subjects, class subjects, a book with a grant for school A only, timetable versions and calendar days. All are removed in afterAll by deleting those schools (cascade) and the test book.
Never rely on prisma/seed.ts data. Never touch rows outside these fixtures.
Portal: no test framework exists and none may be added without user approval. The portal is verified through npm run lint, npm run build, pure view-model logic kept trivially simple (the logic lives on the backend), and the manual QA script in §19 Phase 10, run against a local API.

17.2 Required test cases (minimum)

| Area | File | Cases |
|---|---|---|
| AI output validation | planner-chapter-analysis.schema.spec.ts, planner-chapter-analysis.service.spec.ts | valid passes; bad portion key; forward dependency; a cycle; minutes outside min/max; anchors not in text (≤25% gives a warning, >25% invalid); retry once then PROVISIONAL fallback; missing content skips the AI with a warning; cache hit skips the AI; AIRequest FAILED logged; fenced JSON parsed |
| Difficulty and allocation | schedule-engine.spec.ts, subject-profiles.spec.ts | HIGH complexity takes more slots than LOW for equal text; math worked-examples and practice share; a long chapter splits across periods with part labels; no chapter starts with fewer than 10 minutes left; stage minutes never exceed slot minutes |
| Activities on and off | schedule-engine.spec.ts | enabled inserts after afterPortionKey; disabled removes only activity segments; count 0..5; deleting an activity keeps portion coverage (COVERAGE_VIOLATION never thrown for valid ops) |
| Recalculation | schedule-engine.spec.ts | move SINGLE leaves a gap; WITH_FOLLOWING is one forward pass and terminates when slots run out (overflow, not loop); reorder violating a dependency gives DEPENDENCY_VIOLATION; duration increase spills; lessonKey stability |
| Holiday exclusion | school-calendar.spec.ts, engine | HOLIDAY event at school, grade and section scope; calendar NON_WORKING; precedence section > grade > all; calendar beats event at a tie; multi-day event across timezone midnight |
| Mon–Fri default | school-calendar.spec.ts | Sat/Sun excluded; WORKING Saturday with followsWeekday=MONDAY uses Monday periods; WORKING Saturday without followsWeekday rejected by the DTO or service |
| Timetable conflicts | timetable-validation.spec.ts | section overlap; duplicate period; teacher double-booked across sections with overlapping effective ranges; no conflict when ranges don't overlap; invalid times; missing times blocking |
| CSV parsing | timetable-csv.spec.ts | Class One format (TIME column, break rows, footer meta, roman class); Class 7 format (no TIME, "1st Period", "Math\nMiss Raima"); quoted newlines; CRLF |
| Current period | rounds-resolver.spec.ts | before school, first period, exact boundary (end exclusive), break, between periods, after school, holiday, class-teacher grade; at override honoured; school timezone used |
| Missing data | rounds-resolver.spec.ts, academic-planners.service.spec.ts | no timetable gives NO_TIMETABLE; no approved planner; planner without a lesson at the slot gives "No planned lesson"; generate without a timetable and without fallback gives TIMETABLE_REQUIRED; with fallback gives TIMETABLE_ASSUMED warning |
| Teacher and head-teacher permissions | planner-access.service.spec.ts | teacher creating for a subject not assigned → 403; teacher setting another teacherId → 403; head teacher out of scope → SECTION_OUT_OF_SCOPE; head teacher in scope OK; teacher cannot approve; principal cannot edit others' drafts |
| Approval and rejection | planner-approval.service.spec.ts, planner-status.spec.ts | the full transition table; reject or request-changes without a comment → COMMENT_REQUIRED; self-approval forbidden; direct publish only for an approver-created draft; approve supersedes the previous version; BASELINE_CHANGED |
| Concurrent changes | approval spec (mock updateMany count 0) + e2e (Promise.all) | stale expectedRevision → 409 with details.currentRevision; double approve → one ALREADY_DECIDED; overlap creation race serialised (e2e) |
| Partial teaching | teaching-records.service.spec.ts, progress-metrics.spec.ts | PARTIAL requires an unfinished note; the remaining stages appear as continuation in recovery; adherence counts partial separately |
| Classroom observations | classroom-rounds.service.spec.ts | idempotent clientRequestId; server re-resolves the planned lesson; edit after 24h is locked; teacher sees only shared observations; future date rejected |
| Recovery | recovery-engine.spec.ts | S1 slack; S2 buffer to floor; S3 compression respects floors; S4 only when allowed and listed in impact.removed; frozen past lessons unchanged; unreported flagged; baseline remains official until approval; teaching records unchanged after approval |
| Infeasible deadlines | engine + recovery | overflow kept as unscheduled (never deleted); earliestFeasibleExamDate suggested; exam date unchanged; submit without acknowledgement → RISK_ACKNOWLEDGEMENT_REQUIRED |
| Version history | approval spec + e2e | version numbers increment; events recorded in order; APPROVED, SUPERSEDED and REJECTED immutable (edit → VERSION_NOT_EDITABLE) |
| Adherence | progress-metrics.spec.ts | future lessons excluded; today's ongoing slot excluded; unreported separate from not taught |
| Multi-tenant isolation | e2e | a school B user gets 404 or 403 on school A planners, versions, records, observations, timetable versions and imports; a book granted only to A is invisible to B; list endpoints never leak A rows |
| AI help is read-only | teaching-help.service.spec.ts | no prisma writes; basis OBJECTIVES_ONLY when there is no content |
| Regression | npm test (whole suite), e2e app.e2e-spec.ts when a DB is available | existing suites unchanged; GET /academics/timetable legacy shape preserved when no versions exist (unit test on listTimetable with mocked resolver) |

Test data must be clearly separated from production data (fixture schools only; never use seed credentials against production).

18. Dependency-ordered phases

Before each phase, re-read the relevant files. After each phase:

run npx tsc --noEmit -p tsconfig.json (backend);
run the new specs (npx jest <path>);
run portal npm run lint when the portal changed;
update docs/ACADEMIC_PLANNER_PROGRESS.md.

Phase 0: Verify findings and baseline.

git status, and record the user's modified and untracked files.
Verify the key claims in §1 by opening the cited files: guards, parseException, listTimetable, LessonsModule exports, AI providers, the cache skip list, the env targets.
Run baseline npm test (backend), npx tsc --noEmit -p tsconfig.json, and portal npm run lint. Record pre-existing failures; do not fix unrelated failures.

Phase 1: Schema and core domain.

Prisma changes (§5).
planner-types.ts, planner-status.ts, school-calendar.ts, subject-profiles.ts, schedule-engine.ts, timetable-csv.ts, timetable-matching.ts, timetable-validation.ts, progress-metrics.ts, rounds-resolver.ts, recovery-engine.ts, all with specs.
These are pure modules with no Nest dependencies.

Phase 2: Calendar and timetable APIs and permissions.

TimetablesModule (calendar service and controller, resolver, imports with CSV only at first, versions, publish, legacy adopt).
listTimetable switched to the resolver.
LessonsModule export.
Cache skip list.
Service specs.

Phase 3: Planner APIs and permissions.

PlannerAccessService, PlannerContentService plus the LibraryBooksService additions, AcademicPlannersService (create, list, get, payload, chapter set and order, activities CRUD, moves, reorder, lesson patch, generate using provisional analyses), and PlannerApprovalService with compare-and-set and notifications.
Controller and DTOs. Specs.

Phase 4: AI and deterministic scheduling integration.

Provider methods and mocks, schemas, prompts, the three AI services.
The analyze and regenerate activities endpoints.
Image timetable extraction wired into imports.
Specs.

Phase 5: Planner editor and approval UI.

api-client details, error messages, the services, planner-view-model.ts, the planner components and pages, approvals page, sidebar entries.

Phase 6: Timetable upload UI.

/school/timetable/manage, the import review and version editor pages, the publish dialog, the calendar setup page, and the updated timetable viewer.

Phase 7: Classroom rounds.

ClassroomRoundsService and controller, observations, follow-ups; the rounds board and observation sheet (mobile-first).

Phase 8: Daily teaching and AI help.

TeachingRecordsService (my-day, upsert, list), the teaching-help endpoint, the today page, the dashboard card, and the record and help dialogs.

Phase 9: Recovery and reporting.

PlannerRecoveryService and its endpoint, the recovery page with diff, PlannerReportsService and controller, the overview UI, and pending counts.

Phase 10: Full verification.

Whole backend npm test, backend typecheck and npm run build.
Portal npm run lint and npm run build.
E2E against a safe local database, if available.
Manual QA script against a local API.
Final report (§21).

Composer must not build mocked UI first and defer business logic. If it runs out of context, leave a clear progress record in docs/ACADEMIC_PLANNER_PROGRESS.md with completed phases, files changed, tests run, remaining tasks, and the next precise action.

19. Acceptance criteria per phase

Phase 0

Progress file created.
Baseline results recorded.
Any finding contradicting this prompt is documented with the file and line.

Phase 1

npx prisma validate passes.
npx prisma generate passes.
Typecheck passes.
All pure specs pass: engine, calendar, CSV, validation, metrics, rounds, recovery, status.
No changes to existing columns.
The engine never drops required segments (an assertion in the tests).

Phase 2

A CSV upload of each data/ format produces drafts with correct periods and issues.
Publish blocks on blocking issues, chains effective dates, and returns the affected planners.
/academics/timetable returns the identical shape for a legacy-only school.
Every write route rejects TEACHER and principals without MANAGE_CLASSES.

Phase 3

Creating, editing, moving and reordering work through the API with compare-and-set.
Overlap is prevented.
The state machine is fully enforced server-side.
Notifications are created on submit and decide.
The permission matrix specs pass.

Phase 4

Analysis works with a key and in mock mode.
Invalid AI output falls back to PROVISIONAL with a warning.
Missing content never calls the AI.
AIRequest rows are logged with the new types.
No credentials appear in code.

Phase 5

A teacher can create, analyse, generate, edit (drag and drop and dialogs), and submit.
A principal can approve, reject or request changes.
All three views stay consistent after every mutation.
A conflict produces a refresh, not lost data.
Lint passes.

Phase 6

An admin can upload, review, correct, validate and publish.
Image uploads never publish without review.
XLSX and PDF uploads show the guidance message.

Phase 7

Rounds show correct states for each time-of-day scenario through ?at.
Observations are idempotent.
Head-teacher scope is enforced.
The mobile layout is usable at a 360px width.

Phase 8

A teacher sees today's lessons and records outcomes.
Future outcomes are rejected.
Partial outcomes need a note.
Teaching help is read-only and labels its basis.

Phase 9

A recovery proposal is created as a draft with impact, without changing the official version.
Approval supersedes the official version.
Records are untouched.
Infeasible proposals list the alternatives, and the exam date is unchanged.
Adherence excludes future lessons.

Phase 10

Every command in §21 is run, and its result reported truthfully.

20. Deployment and migration precautions

Do not push, deploy or open a PR unless the user asks. A merge to main triggers the VPS deploy and prisma db push in production (docker-entrypoint.sh, docker-compose.prod.yml with SKIP_DB_PUSH:"false"). There is also a Vercel deploy workflow.
Schema changes are additive only (§5.1). Before handing over, run npx prisma validate. If a local test database exists, also run prisma migrate diff against it and confirm the output contains only CREATE TABLE, ALTER TABLE ... MODIFY for enum additions, and CREATE INDEX / ADD CONSTRAINT statements on new tables. Paste that output summary into the report.
Appending enum values in MySQL rewrites the column definition of notifications.type and ai_requests.type. This is safe but takes a metadata lock on large tables. Note in the report that the first deploy should happen in a low-traffic window.
New environment variables, all optional with safe defaults: PLANNER_ANALYSIS_TIMEOUT_MS, PLANNER_ANALYSIS_MAX_CHARS. Do not edit .env files or deploy env scripts. List the variables in the report.
On serverless (Vercel), PageOcrService returns empty results, so image timetable import degrades to the manual grid with a clear message. CSV works everywhere.
Rollback: reverting the code is enough; the new tables stay unused. Never script table drops.
Never modify production data, run the seed, or run scripts in backend/scripts/ against the remote database.
Do not reset Git, revert unrelated files, overwrite user changes or run destructive database commands. Do not modify production data or deploy automatically.
Do not hardcode provider credentials. Do not assume that AI-generated JSON is valid merely because the model returned it.
Never rely on the frontend hiding as authorization. All new APIs, database queries, file access and background jobs must respect the existing school boundary and permissions.
Never rely on the AI model alone to enforce critical scheduling or authorization rules. Do not implement scheduling entirely through an AI prompt.
Do not rewrite HawkNexa, migrate it to another framework or replace existing authentication. Do not introduce microservices, new queues, new state-management libraries, additional databases or architectural patterns without a concrete reason.
Do not silently change the examination date. Never blindly shift all subsequent lessons or remove required syllabus content to meet a deadline.
Teachers must not upload lesson materials. AI assistance must not modify the approved planner or mark lessons completed.
Do not calculate schedule adherence by counting future lessons as incomplete.
Do not automatically publish unreviewed OCR results.
Do not invent a lesson if the timetable or approved planner does not provide enough information.
Do not claim the AI analyzed unavailable content.

21. Final completion report format

End your work with exactly this structure, filled in truthfully:

# Academic Planner — Implementation Report

## 1. Status
Overall: COMPLETE | PARTIAL (phases done: …; phases remaining: …)

## 2. Phases
| Phase | Status | Notes |

## 3. Files
### Created
- path — responsibility
### Modified
- path — what changed (one line)
### Explicitly untouched user files (verified via git status)
- …

## 4. Database
- New enums / enum values:
- New tables (name — purpose — key constraints):
- Back-relations added:
- prisma validate: PASS/FAIL ; prisma migrate diff (local only): RUN/NOT RUN — summary
- Deployment notes / env vars:

## 5. Commands run (exact command → result)
- backend: npm test → X passed / Y failed (list failures; mark pre-existing vs new)
- backend: npx tsc --noEmit -p tsconfig.json → …
- backend: npm run build → …
- backend: npm run lint → NOT RUNNABLE (eslint not installed) — or result if it ran
- backend e2e (safe local DB) → RUN/NOT RUN (reason)
- portal: npm run lint → …
- portal: npm run build → …
- manual QA (local API) → RUN/NOT RUN; scenarios covered

## 6. Requirement coverage
| Capability | Implemented | Tests | Notes |
(centrally managed content, AI chapter analysis, subject-specific lesson planning, interactive planner editing, planner approval and version history, weekly timetable upload and management, mobile classroom-round monitoring, daily teacher progress records, AI teaching assistance, schedule recovery and approval, academic progress reporting and notifications)

## 7. Known limitations & follow-ups
- XLSX/PDF timetable parsing not supported (reason)
- Public /uploads exposure of uploaded files (pre-existing)
- No portal notification inbox (pending counts only)
- No DnD library (native HTML5 only)
- No optimistic locking elsewhere in repo (revision compare-and-set introduced here only)
- Backend eslint not installed (lint script not runnable)
- …

## 8. Next precise action (if PARTIAL)
- File, function, and what to do next

Manual QA script for Phase 10. Run it only against a local API with NEXT_PUBLIC_USE_LOCAL_API=true and a local database:

As admin: upload the Class One CSV, fix the issues, publish, and add a holiday.
As teacher: create a planner, analyse, generate, drag a lesson, move with following lessons, toggle activities, and submit.
As principal: request changes; then, after resubmission, approve.
As teacher: record today's lessons as PARTIAL and then COMPLETED, and open teaching help.
As head teacher: do rounds with ?at= set to a period time, observe, and add a follow-up.
As teacher: propose recovery and submit; as principal: approve, then check that the records are intact and the reports show correct adherence.
Log in as a user of a second school and confirm none of this data is visible.

---

End of HawkNexa — Composer 2.5 Implementation Master Prompt.

