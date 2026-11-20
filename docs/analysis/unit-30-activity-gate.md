# Unit 30 activity showability gate

Generated during deploy fix work (production audit pending `TEACHER_PASSWORD` / `SUPERADMIN_PASSWORD`).

Run after deploy:

```bash
SUPERADMIN_PASSWORD=… TEACHER_PASSWORD=… python3 scripts/diagnose-unit-30-activity-gate.py
```

## Code checks (`isShowableSavedActivity` / `explainShowableSavedActivityFailures`)

Current prompt version in repo: **`chapter-teaching-pack-v12`**

An activity must have all of:

| Check | Failure message |
| --- | --- |
| Non-empty title | missing title |
| Non-empty description | missing description |
| Non-empty `learningObjective` not equal to title | missing learning objective / objective repeats the title |
| Non-empty `participationTechnique` | missing participation |
| `teacherSteps` with at least 3 strings | fewer than 3 teacher steps |
| Example marker in description | no example marker |
| Title/objective not a game name (relay, hunt, round-robin, …) | title or objective is only a game name |
| Expected outcome not “show the idea of …” | expected outcome only names the idea |
| No one-step-pass language in description/steps | students pass one step… |
| Skill chapter: digit or given/to prove in description | skill unit needs digits… |

`storedSteps` reads **`teacherSteps`**, not `steps`. Old packs saved without `learningObjective` / `teacherSteps` always fail.

## Confirmed relay shape (production report, pre–v12 deploy)

`Degree–minute–second relay` (and similar cards) fail because:

1. **missing learning objective** (field empty in DB)
2. **fewer than 3 teacher steps**
3. **no example marker** in description
4. **title or objective is only a game name** (`relay`)
5. **students pass one step…** when participation/description says pass to next student
6. **skill unit needs digits** when the description has no numbers or worked example

Planner `activityDayNotes` then shows:

`The saved activity for {chapter} is not complete enough to teach. Use the next numbered application in the textbook.`

That is **correct** for an unshowable pack. The bug is the **stored pack**, not the stub copy.

## Planner generate vs pack generation

`AcademicPlannersWorkflowService.generate` calls **`refreshTeachingPacks`** for each planner chapter **before** `generateDayPlanFromTeachingPacks`.

- Refresh runs when `contentHash` or `promptVersion` ≠ `CHAPTER_TEACHING_PACK_PROMPT_VERSION`.
- If AI generation fails `assertConductableActivities` / `isShowableSavedActivity`, refresh **throws** and the **old pack remains** (warning `TEACHING_PACK_REFRESH_FAILED`).
- Planner build still runs; Activity days use the stale activities.

After deploy, teachers must **generate the planner again** so refresh can attempt a v12 pack. If refresh still fails, the stub remains until generation succeeds.

## Selection across slices

`chooseShowableChapterActivity` picks any **showable** activity in the chapter (not only `coveredSliceKeys`). A complete card on `s6` can appear on a 2-day Intro+Activity plan even when only `s1` was “taught” — **if** that card is showable in the DB.

## Fixes in this deploy

1. Teaching-pack debug API returns `learningObjective`, `teacherSteps`, `expectedOutcome`, `codePromptVersion`, and `activityShowableAudit`.
2. `upsertChapterTeachingPack` calls **`assertConductableActivities`** so unshowable activity 1 cannot be saved.
3. Pack generation gets **3 attempts** when activities are rejected.
4. Script `scripts/diagnose-unit-30-activity-gate.py` writes an updated copy of this file from production.