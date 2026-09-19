"use client";

import { useMemo, useState } from "react";
import { GripVertical, Plus, Trash2, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import type {
  HeadTeacherBoard,
  HeadTeacherBoardAssignment,
  HeadTeacherBoardSection,
} from "@/services/head-teachers.service";

type DraftAssignment = {
  teacherId: string;
  title: string;
  sectionIds: string[];
};

type HeadTeacherBoardEditorProps = {
  board: HeadTeacherBoard;
  onSave: (assignments: DraftAssignment[]) => void;
  saving?: boolean;
};

function classChip(section: HeadTeacherBoardSection) {
  return (
    <span
      key={section.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/section-id", section.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="inline-flex cursor-grab items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium active:cursor-grabbing"
    >
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      {section.classLabel}
    </span>
  );
}

export function HeadTeacherBoardEditor({ board, onSave, saving }: HeadTeacherBoardEditorProps) {
  const [draft, setDraft] = useState<DraftAssignment[]>(() =>
    board.assignments.map((row) => ({
      teacherId: row.teacherId,
      title: row.title,
      sectionIds: row.sections.map((section) => section.id),
    })),
  );

  const sectionMap = useMemo(() => {
    const map = new Map<string, HeadTeacherBoardSection>();
    for (const section of board.unassignedSections) map.set(section.id, section);
    for (const assignment of board.assignments) {
      for (const section of assignment.sections) map.set(section.id, section);
    }
    return map;
  }, [board]);

  const assignedIds = new Set(draft.flatMap((row) => row.sectionIds));
  const pool = [...sectionMap.values()].filter((section) => !assignedIds.has(section.id));

  const addAssignment = () => {
    const nextTeacher = board.teachers.find(
      (teacher) => !draft.some((row) => row.teacherId === teacher.id),
    );
    if (!nextTeacher) return;
    setDraft((rows) => [
      ...rows,
      { teacherId: nextTeacher.id, title: "Head Teacher", sectionIds: [] },
    ]);
  };

  const updateAssignment = (index: number, patch: Partial<DraftAssignment>) => {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeAssignment = (index: number) => {
    setDraft((rows) => rows.filter((_, i) => i !== index));
  };

  const moveSectionToAssignment = (sectionId: string, assignmentIndex: number) => {
    setDraft((rows) =>
      rows.map((row, index) => {
        const without = row.sectionIds.filter((id) => id !== sectionId);
        if (index !== assignmentIndex) return { ...row, sectionIds: without };
        return { ...row, sectionIds: [...without, sectionId] };
      }),
    );
  };

  const removeSection = (assignmentIndex: number, sectionId: string) => {
    setDraft((rows) =>
      rows.map((row, index) =>
        index === assignmentIndex
          ? { ...row, sectionIds: row.sectionIds.filter((id) => id !== sectionId) }
          : row,
      ),
    );
  };

  const handleDrop = (assignmentIndex: number, event: React.DragEvent) => {
    event.preventDefault();
    const sectionId = event.dataTransfer.getData("text/section-id");
    if (!sectionId) return;
    moveSectionToAssignment(sectionId, assignmentIndex);
  };

  const availableTeachers = (currentTeacherId?: string) =>
    board.teachers.filter(
      (teacher) =>
        teacher.id === currentTeacherId || !draft.some((row) => row.teacherId === teacher.id),
    );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Unassigned classes</h2>
            <p className="text-sm text-muted-foreground">Drag a class onto a head teacher below.</p>
          </div>
        </div>
        <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-dashed bg-muted/20 p-3">
          {pool.length ? pool.map((section) => classChip(section)) : (
            <p className="text-sm text-muted-foreground">All classes are assigned.</p>
          )}
        </div>
      </section>

      <div className="space-y-4">
        {draft.map((assignment, index) => {
          const teacher = board.teachers.find((row) => row.id === assignment.teacherId);
          const sections = assignment.sectionIds
            .map((id) => sectionMap.get(id))
            .filter(Boolean) as HeadTeacherBoardSection[];

          return (
            <section
              key={`${assignment.teacherId}-${index}`}
              className="rounded-xl border bg-card p-4"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(index, event)}
            >
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Head teacher</Label>
                    <Select
                      value={assignment.teacherId}
                      onChange={(event) => updateAssignment(index, { teacherId: event.target.value })}
                    >
                      {availableTeachers(assignment.teacherId).map((row) => (
                        <option key={row.id} value={row.id}>{row.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input
                      value={assignment.title}
                      onChange={(event) => updateAssignment(index, { title: event.target.value })}
                      placeholder="e.g. Primary Head Teacher"
                    />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeAssignment(index)}>
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </div>

              <div className="rounded-lg border border-dashed bg-muted/10 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Supervised classes
                </p>
                <div className="flex flex-wrap gap-2">
                  {sections.length ? (
                    sections.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/section-id", section.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => removeSection(index, section.id)}
                        className="inline-flex cursor-grab items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:border-destructive/40 active:cursor-grabbing"
                        title="Click to unassign"
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        {section.classLabel}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Drop classes here</p>
                  )}
                </div>
                {teacher ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {teacher.name} · {teacher.employeeCode}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {draft.length === 0 ? (
        <EmptyState
          icon={<UserSquare2 className="h-10 w-10" />}
          title="No head teachers yet"
          description="Add a head teacher, give them a title, then drag classes under them."
          action={
            <Button onClick={addAssignment}>
              <Plus className="h-4 w-4" />
              Add head teacher
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addAssignment} disabled={draft.length >= board.teachers.length}>
            <Plus className="h-4 w-4" />
            Add head teacher
          </Button>
          <Button onClick={() => onSave(draft)} disabled={saving}>
            {saving ? "Saving..." : "Save head teachers"}
          </Button>
        </div>
      )}
    </div>
  );
}
