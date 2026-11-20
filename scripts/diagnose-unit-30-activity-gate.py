#!/usr/bin/env python3
"""Audit teaching-pack activities for showability (Unit 30 / any chapter)."""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = os.environ.get("HAWKNEXA_API", "https://hawknexabackend.fynals.com/api/v1")
OUT = Path(__file__).resolve().parents[1] / "docs" / "analysis" / "unit-30-activity-gate.md"
CHAPTER_HINT = re.compile(r"unit\s*30|introduction\s+to\s+trigonometry", re.I)
MATHS_BOOK = re.compile(r"math", re.I)
EXAMPLE_MARKER = re.compile(
    r"\bexample\s+(answer|argument|verdict|question|decision|working)\b|\bworked example\b|\bfor example\b|\bsample\s*:|\bexample\s*:",
    re.I,
)
GAME_NAME = re.compile(
    r"\b(relays?|hunts?|round[- ]robins?|sorting|matching pairs|quick chains?|terminolog(?:y|ies)|whip[- ]arounds?|speed grids?|human unit circle)\b",
    re.I,
)
PASS_ONE = re.compile(
    r"\b(pass(?:es|ed|ing)? (?:around|on|it|one step|the next)|one step of (?:a |the )?|stand(?:ing)? in a circle|sit(?:ting)? in a circle)\b",
    re.I,
)
SKILL_SIGNAL = re.compile(
    r"\b(convert|construct|compass|prove|proving|ratio|proportion|degrees|minutes|chord|tangent|equation|formula|calculate|measure|simplify)\b",
    re.I,
)
SKILL_PROCEDURE = re.compile(r"\b(step|method|formula|calculate|convert|construct|solve|simplify|prove)\b", re.I)


def same_label(left: str, right: str) -> bool:
    return left.strip().lower().split() == right.strip().lower().split()


def stored_steps(activity: dict) -> list[str]:
    raw = activity.get("teacherSteps")
    if not isinstance(raw, list):
        return []
    return [s.strip() for s in raw if isinstance(s, str) and s.strip()]


def chapter_is_skill_unit(chapter_text: str) -> bool:
    chapter = chapter_text or ""
    if not chapter.strip():
        return False
    if SKILL_SIGNAL.search(chapter):
        return True
    digits = len(re.findall(r"\d", chapter))
    return digits >= 3 and bool(SKILL_PROCEDURE.search(chapter))


def explain_showable_failures(activity: dict, chapter_text: str) -> list[str]:
    failures: list[str] = []
    title = (activity.get("title") or "").strip()
    description = (activity.get("description") or "").strip()
    objective = (activity.get("learningObjective") or "").strip()
    steps = stored_steps(activity)
    label = title or "Activity"

    if not title:
        failures.append(f"{label}: missing title")
    if not description:
        failures.append(f"{label}: missing description")
    if not objective:
        failures.append(f"{label}: missing learning objective")
    elif same_label(objective, title):
        failures.append(f"{label}: objective repeats the title")
    if not (activity.get("participationTechnique") or "").strip():
        failures.append(f"{label}: missing participation")
    if len(steps) < 3:
        failures.append(f"{label}: fewer than 3 teacher steps (stored in teacherSteps)")
    if not EXAMPLE_MARKER.search(description):
        failures.append(f"{label}: no example marker (Example answer, For example, Worked example, Sample)")
    if GAME_NAME.search(f"{title}\n{objective}"):
        failures.append(f"{label}: title or objective is only a game name")
    if re.search(r"\bshow the idea of\b", activity.get("expectedOutcome") or "", re.I):
        failures.append(f"{label}: expected outcome only names the idea of the title")
    if PASS_ONE.search(f"{description}\n" + "\n".join(steps)):
        failures.append(f"{label}: students pass one step instead of finishing a full item")
    has_figure = bool(re.search(r"\b(given|to prove|the figure|radius|diameter)\b", description, re.I))
    if chapter_is_skill_unit(chapter_text) and not re.search(r"\d", description) and not has_figure:
        failures.append(f"{label}: skill unit needs digits or given/to prove on the card")
    return failures


def post_json(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    if not payload.get("success"):
        raise RuntimeError(payload)
    return payload["data"]


def get_json(path: str, token: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"}, method="GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    if not payload.get("success"):
        raise RuntimeError(payload)
    return payload["data"]


def login(username: str, password: str, expected_role: str | None = None) -> str:
    body: dict = {"username": username, "password": password}
    if expected_role:
        body["expectedRole"] = expected_role
    data = post_json("/auth/login", body)
    token = data.get("accessToken")
    if not token:
        raise RuntimeError("No accessToken")
    return token


def main() -> int:
    sa_pass = os.environ.get("SUPERADMIN_PASSWORD")
    t_pass = os.environ.get("TEACHER_PASSWORD")
    t_user = os.environ.get("TEACHER_USER", "t03330224616")
    if not sa_pass or not t_pass:
        print("Set SUPERADMIN_PASSWORD and TEACHER_PASSWORD.", file=sys.stderr)
        return 1

    sa_token = login(os.environ.get("SUPERADMIN_USER", "superadmin"), sa_pass, "SUPER_ADMIN")
    t_token = login(t_user, t_pass)

    books = get_json("/library-books", sa_token)
    maths = [b for b in books if MATHS_BOOK.search(b.get("subjectLabel", "") or "")]
    if not maths:
        raise RuntimeError("No Maths book found for this school.")

    def find_unit_30_chapter(detail: dict) -> dict | None:
        chapters = detail.get("chapters") or []
        return next(
            (c for c in chapters if CHAPTER_HINT.search(c.get("title", "") or "") or c.get("chapterNumber") == 30),
            None,
        )

    def class_x_score(book: dict) -> int:
        label = f"{book.get('classLabel', '')} {book.get('title', '')}"
        if re.search(r"class\s*x\b|\bclass\s*10\b|\bgrade\s*10\b", label, re.I):
            return 2
        if re.search(r"\bx\b", label, re.I) and not re.search(r"\bix\b", label, re.I):
            return 2
        return 0

    book = None
    chapter = None
    detail = None
    ranked = sorted(maths, key=class_x_score, reverse=True)
    for candidate in ranked:
        d = get_json(f"/library-books/{candidate['id']}", sa_token)
        ch = find_unit_30_chapter(d)
        if ch:
            book, detail, chapter = candidate, d, ch
            break
    if not book or not chapter or not detail:
        raise RuntimeError("Unit 30 chapter not found in any Maths library book.")

    book_id = book["id"]

    ch_id = chapter["id"]
    debug = get_json(f"/academic-planners/books/{book_id}/chapters/{ch_id}/teaching-pack-debug", t_token)

    lines = [
        "# Unit 30 activity showability gate",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"API: `{BASE}`",
        "",
        "## Book and chapter",
        "",
        f"- Book: **{detail.get('title')}** (`{book_id}`)",
        f"- Chapter: **{chapter.get('title')}** (`{ch_id}`), number {chapter.get('chapterNumber')}",
        "",
        "## Code (deployed backend)",
        "",
        f"- `CHAPTER_TEACHING_PACK_PROMPT_VERSION`: `{debug.get('codePromptVersion', '(field missing — redeploy backend)')}`",
        "",
        "## Pack",
        "",
    ]
    pack = debug.get("pack")
    if not pack:
        lines.append("No teaching pack row.")
    else:
        lines.extend(
            [
                f"- promptVersion: `{pack.get('promptVersion')}`",
                f"- hashMatchesChapter: **{pack.get('hashMatchesChapter')}**",
                f"- source: `{pack.get('source')}`",
                f"- generatedAt: `{pack.get('generatedAt')}`",
                f"- activity count: **{len(pack.get('activities') or [])}**",
                "",
                "## Activity audit (`isShowableSavedActivity`)",
                "",
            ]
        )
        chapter_text = ""
        ch = debug.get("chapter") or {}
        compiled_words = ch.get("compiledWordCount")
        if compiled_words:
            lines.append(f"- chapter compiledWordCount: **{compiled_words}** (skill-unit gate uses chapter text when deployed)")
        audit = debug.get("activityShowableAudit") or []
        if not audit:
            lines.append("")
            lines.append("_Deployed API has no `activityShowableAudit`; failures below match `explainShowableSavedActivityFailures` in code._")
            lines.append("")
            sa_ch = get_json(f"/library-books/{book_id}/chapters/{ch_id}", sa_token)
            chapter_text = (sa_ch.get("publishedText") or "") + "\n" + (sa_ch.get("exercisesText") or "")
            for act in pack.get("activities") or []:
                failures = explain_showable_failures(act, chapter_text)
                lines.append(f"### {act.get('title')}")
                lines.append("")
                lines.append(f"- showable: **{not failures}**")
                lines.append(f"- sliceKey: `{act.get('sliceKey')}`")
                lines.append(f"- learningObjective: {json.dumps(act.get('learningObjective') or '(missing)')}")
                lines.append(f"- teacherSteps count: **{len(stored_steps(act))}**")
                for item in failures:
                    lines.append(f"- fail: {item}")
                lines.append("")
        else:
            for row in audit:
                lines.append(f"### {row.get('title')}")
                lines.append("")
                lines.append(f"- showable: **{row.get('showable')}**")
                failures = row.get("failures") or []
                if failures:
                    for item in failures:
                        lines.append(f"- fail: {item}")
                else:
                    lines.append("- fail: (none)")
                lines.append("")
        lines.extend(
            [
                "## Planner generate",
                "",
                "`generate` on a planner version calls `refreshTeachingPacks` before building days. ",
                "If refresh fails, the previous pack is kept and Activity days use whatever is still stored.",
                "",
            ]
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())