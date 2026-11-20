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
    maths = [
        b
        for b in books
        if MATHS_BOOK.search(b.get("subjectLabel", "") or "")
        and re.search(r"\b10\b|class\s*10", str(b.get("classLabel", "")), re.I)
    ]
    if not maths:
        maths = [b for b in books if MATHS_BOOK.search(b.get("subjectLabel", "") or "")]
    if not maths:
        raise RuntimeError("No Maths book found for this school.")

    book = maths[0]
    book_id = book["id"]
    detail = get_json(f"/library-books/{book_id}", sa_token)
    chapters = detail.get("chapters") or []
    chapter = next(
        (c for c in chapters if CHAPTER_HINT.search(c.get("title", "") or "")),
        None,
    )
    if not chapter:
        titles = [f"{c.get('chapterNumber')}: {c.get('title')}" for c in chapters[:40]]
        raise RuntimeError(f"Unit 30 chapter not found. Sample: {titles}")

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
        audit = debug.get("activityShowableAudit") or []
        if not audit:
            lines.append("_No `activityShowableAudit` in API response — deploy the backend that exposes this field._")
            lines.append("")
            for act in pack.get("activities") or []:
                lines.append(f"### {act.get('title')}")
                lines.append("")
                lines.append(f"- sliceKey: `{act.get('sliceKey')}`")
                lines.append(f"- learningObjective: {json.dumps(act.get('learningObjective', '(missing from API)'))}")
                steps = act.get("teacherSteps") or []
                lines.append(f"- teacherSteps count: **{len(steps) if isinstance(steps, list) else 0}**")
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