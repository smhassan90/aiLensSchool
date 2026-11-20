# Unit 30 activity showability gate

Generated: 2026-11-20T15:28:12.516385+00:00
API: `https://hawknexabackend.fynals.com/api/v1`

## Book and chapter

- Book: **Mathematics for Class X** (`43ebed7d-48fa-4984-a75f-be1462a4c545`)
- Chapter: **Unit 30 — Introduction to Trigonometry** (`200777c4-21ac-42aa-a545-892473065928`), number 30

## Code (deployed backend)

- `CHAPTER_TEACHING_PACK_PROMPT_VERSION`: `chapter-teaching-pack-v12`

## Pack

- promptVersion: `chapter-teaching-pack-v1`
- hashMatchesChapter: **True**
- source: `AI`
- generatedAt: `2026-10-28T20:11:22.801Z`
- activity count: **8**

## Activity audit (`isShowableSavedActivity`)

- chapter compiledWordCount: **5919** (skill-unit gate uses chapter text when deployed)
### Degree–minute–second relay

- showable: **False**
- fail: Degree–minute–second relay: missing learning objective
- fail: Degree–minute–second relay: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Degree–minute–second relay: no example marker (Example answer, For example, Worked example, Sample)
- fail: Degree–minute–second relay: title or objective is only a game name
- fail: Degree–minute–second relay: skill unit needs digits or given/to prove on the card

### Sector formula pair drill

- showable: **False**
- fail: Sector formula pair drill: missing learning objective
- fail: Sector formula pair drill: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Sector formula pair drill: no example marker (Example answer, For example, Worked example, Sample)

### Quadrant human unit circle

- showable: **False**
- fail: Quadrant human unit circle: missing learning objective
- fail: Quadrant human unit circle: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Quadrant human unit circle: no example marker (Example answer, For example, Worked example, Sample)
- fail: Quadrant human unit circle: title or objective is only a game name
- fail: Quadrant human unit circle: skill unit needs digits or given/to prove on the card

### 30–45–60 speed grid

- showable: **False**
- fail: 30–45–60 speed grid: missing learning objective
- fail: 30–45–60 speed grid: fewer than 3 teacher steps (stored in teacherSteps)
- fail: 30–45–60 speed grid: no example marker (Example answer, For example, Worked example, Sample)
- fail: 30–45–60 speed grid: title or objective is only a game name

### One ratio, find the rest

- showable: **False**
- fail: One ratio, find the rest: missing learning objective
- fail: One ratio, find the rest: fewer than 3 teacher steps (stored in teacherSteps)
- fail: One ratio, find the rest: no example marker (Example answer, For example, Worked example, Sample)

### Identity proof chain

- showable: **False**
- fail: Identity proof chain: missing learning objective
- fail: Identity proof chain: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Identity proof chain: no example marker (Example answer, For example, Worked example, Sample)

### Elevation and depression sketch gallery

- showable: **False**
- fail: Elevation and depression sketch gallery: missing learning objective
- fail: Elevation and depression sketch gallery: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Elevation and depression sketch gallery: no example marker (Example answer, For example, Worked example, Sample)
- fail: Elevation and depression sketch gallery: skill unit needs digits or given/to prove on the card

### Chapter summary whip-around

- showable: **False**
- fail: Chapter summary whip-around: missing learning objective
- fail: Chapter summary whip-around: fewer than 3 teacher steps (stored in teacherSteps)
- fail: Chapter summary whip-around: no example marker (Example answer, For example, Worked example, Sample)
- fail: Chapter summary whip-around: title or objective is only a game name
- fail: Chapter summary whip-around: students pass one step instead of finishing a full item
- fail: Chapter summary whip-around: skill unit needs digits or given/to prove on the card

## Planner generate

`generate` on a planner version calls `refreshTeachingPacks` before building days. 
If refresh fails, the previous pack is kept and Activity days use whatever is still stored.
