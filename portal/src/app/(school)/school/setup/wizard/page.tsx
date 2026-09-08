"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { setupService } from "@/services/school-ops.service";
import { useToast } from "@/providers/toast-provider";
import { ExamPapersEditor } from "@/components/exams/exam-papers-editor";
import { defaultExamDrafts, toExamPayload, type DraftExamPaper } from "@/lib/exam-patterns";
import { ApiClientError } from "@/lib/api-client";
import { Plus, Trash2 } from "lucide-react";

const DRAFT_KEY = "ailens-school-setup-draft-v2";
const SUGGESTED_STAGES = ["Pre-Primary", "Primary", "Secondary"];
const SUGGESTED_SUBJECTS = [
  "English",
  "Urdu",
  "Maths",
  "Science",
  "Islamiat",
  "Social Studies",
  "Computer",
  "Arts",
];

type TeacherDraft = { key: string; name: string; phone: string };
type StageDraft = { key: string; name: string; coordinatorKey: string };
type SubjectDraft = { key: string; name: string; teacherKey: string };
type ClassDraft = {
  key: string;
  name: string;
  stageKey: string;
  classTeacherKey: string;
  admissionFee: string;
  tuitionFee: string;
  subjects: SubjectDraft[];
};

type Draft = {
  yearName: string;
  startDate: string;
  endDate: string;
  minQuizzes: string;
  teachers: TeacherDraft[];
  stages: StageDraft[];
  classes: ClassDraft[];
};

const STEPS = [
  { id: 0, title: "Year & exams" },
  { id: 1, title: "Teachers" },
  { id: 2, title: "School sections" },
  { id: 3, title: "Classes" },
  { id: 4, title: "Review" },
];

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySubject(): SubjectDraft {
  return { key: uid(), name: "", teacherKey: "" };
}

function emptyClass(): ClassDraft {
  return {
    key: uid(),
    name: "",
    stageKey: "",
    classTeacherKey: "",
    admissionFee: "",
    tuitionFee: "",
    subjects: [emptySubject()],
  };
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function defaultDraft(): Draft {
  return {
    yearName: "2026-27",
    startDate: "",
    endDate: "",
    minQuizzes: "4",
    teachers: [{ key: uid(), name: "", phone: "" }],
    stages: [],
    classes: [],
  };
}

export default function SetupWizardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [papers, setPapers] = useState<DraftExamPaper[]>(defaultExamDrafts);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [classForm, setClassForm] = useState<ClassDraft>(emptyClass);
  const [copyFrom, setCopyFrom] = useState("");
  const [credentials, setCredentials] = useState<Array<{
    name: string;
    phone: string;
    email: string;
    temporaryPassword: string | null;
    employeeCode: string;
    existingAccount: boolean;
  }> | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Draft>;
      setDraft((current) => ({ ...current, ...parsed, teachers: parsed.teachers?.length ? parsed.teachers : current.teachers }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const teacherLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const teacher of draft.teachers) {
      const name = teacher.name.trim() || "Unnamed teacher";
      map.set(teacher.key, teacher.phone ? `${name} (${teacher.phone})` : name);
    }
    return map;
  }, [draft.teachers]);

  const patch = (partial: Partial<Draft>) => setDraft((current) => ({ ...current, ...partial }));

  const addTeacher = () =>
    patch({ teachers: [...draft.teachers, { key: uid(), name: "", phone: "" }] });
  const updateTeacher = (key: string, partial: Partial<TeacherDraft>) =>
    patch({ teachers: draft.teachers.map((item) => (item.key === key ? { ...item, ...partial } : item)) });
  const removeTeacher = (key: string) => {
    if (draft.teachers.length === 1) return;
    patch({
      teachers: draft.teachers.filter((item) => item.key !== key),
      stages: draft.stages.map((stage) =>
        stage.coordinatorKey === key ? { ...stage, coordinatorKey: "" } : stage,
      ),
      classes: draft.classes.map((item) => ({
        ...item,
        classTeacherKey: item.classTeacherKey === key ? "" : item.classTeacherKey,
        subjects: item.subjects.map((subject) => ({
          ...subject,
          teacherKey: subject.teacherKey === key ? "" : subject.teacherKey,
        })),
      })),
    });
  };

  const addStage = (name = "") => patch({ stages: [...draft.stages, { key: uid(), name, coordinatorKey: "" }] });
  const updateStage = (key: string, partial: Partial<StageDraft>) =>
    patch({ stages: draft.stages.map((item) => (item.key === key ? { ...item, ...partial } : item)) });
  const removeStage = (key: string) => {
    patch({
      stages: draft.stages.filter((item) => item.key !== key),
      classes: draft.classes.map((item) => (item.stageKey === key ? { ...item, stageKey: "" } : item)),
    });
  };

  const saveClass = () => {
    const name = classForm.name.trim();
    if (!name) {
      toast({ title: "Class name is required", variant: "error" });
      return;
    }
    if (!classForm.stageKey) {
      toast({ title: "Choose the school section for this class", variant: "error" });
      return;
    }
    const subjects = classForm.subjects
      .map((subject) => ({ ...subject, name: subject.name.trim() }))
      .filter((subject) => subject.name);
    if (!subjects.length) {
      toast({ title: "Add at least one subject", variant: "error" });
      return;
    }
    const next: ClassDraft = { ...classForm, name, subjects };
    const exists = draft.classes.some((item) => item.key === classForm.key);
    patch({
      classes: exists
        ? draft.classes.map((item) => (item.key === classForm.key ? next : item))
        : [...draft.classes, next],
    });
    setClassForm(emptyClass());
    setCopyFrom("");
  };

  const editClass = (item: ClassDraft) => {
    setClassForm({
      ...item,
      subjects: item.subjects.length ? item.subjects : [emptySubject()],
    });
  };

  const applyCopy = (fromKey: string) => {
    setCopyFrom(fromKey);
    const source = draft.classes.find((item) => item.key === fromKey);
    if (!source) return;
    setClassForm((current) => ({
      ...current,
      subjects: source.subjects.map((subject) => ({ ...subject, key: uid() })),
      admissionFee: current.admissionFee || source.admissionFee,
      tuitionFee: current.tuitionFee || source.tuitionFee,
    }));
  };

  const validateStep = () => {
    if (step === 0) {
      if (!draft.yearName.trim() || !draft.startDate || !draft.endDate) {
        toast({ title: "Enter the session name and dates", variant: "error" });
        return false;
      }
      if (!toExamPayload(papers).length) {
        toast({ title: "Add at least one exam paper", variant: "error" });
        return false;
      }
    }
    if (step === 1) {
      const ready = draft.teachers.filter((item) => item.name.trim() && item.phone.trim());
      if (!ready.length) {
        toast({ title: "Add at least one teacher with name and phone", variant: "error" });
        return false;
      }
    }
    if (step === 2) {
      if (!draft.stages.some((item) => item.name.trim())) {
        toast({ title: "Add at least one school section", variant: "error" });
        return false;
      }
    }
    if (step === 3 && !draft.classes.length) {
      toast({ title: "Add at least one class", variant: "error" });
      return false;
    }
    return true;
  };

  const run = useMutation({
    mutationFn: () => {
      const exams = toExamPayload(papers);
      const teachers = draft.teachers
        .filter((item) => item.name.trim() && item.phone.trim())
        .map((item) => {
          const { firstName, lastName } = splitName(item.name);
          return { key: item.key, firstName, lastName, phone: item.phone.trim() };
        });
      const stages = draft.stages
        .filter((item) => item.name.trim())
        .map((item) => ({
          key: item.key,
          name: item.name.trim(),
          ...(item.coordinatorKey ? { coordinatorKey: item.coordinatorKey } : {}),
      }));
      return setupService.run({
        yearName: draft.yearName.trim(),
        startDate: draft.startDate,
        endDate: draft.endDate,
        teachers,
        stages,
        classes: draft.classes.map((item) => ({
          name: item.name,
          stageKey: item.stageKey,
          ...(item.classTeacherKey ? { classTeacherKey: item.classTeacherKey } : {}),
          ...(item.admissionFee ? { admissionFee: Number(item.admissionFee) } : {}),
          ...(item.tuitionFee ? { tuitionFee: Number(item.tuitionFee) } : {}),
          subjects: item.subjects
            .filter((subject) => subject.name.trim())
            .map((subject) => ({
              name: subject.name.trim(),
              ...(subject.teacherKey ? { teacherKey: subject.teacherKey } : {}),
            })),
        })),
        exams,
        minQuizzes: Number(draft.minQuizzes) || 4,
      });
    },
    onSuccess: (data) => {
      sessionStorage.removeItem(DRAFT_KEY);
      setCredentials(data.teachers);
      toast({ title: "School is ready", description: "Save the teacher logins below.", variant: "success" });
    },
    onError: (err: Error) =>
      toast({
        title: "Setup failed",
        description: err instanceof ApiClientError ? err.message : err.message,
        variant: "error",
      }),
  });

  if (credentials) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Setup complete" description="Share these logins with teachers. They will be asked to change the password." />
        <Card className="max-w-3xl">
          <CardContent className="overflow-x-auto p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Teacher</th>
                  <th className="pb-2 pr-3">Phone</th>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2">Password</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((teacher) => (
                  <tr key={teacher.email} className="border-b last:border-0">
                    <td className="py-2 pr-3">{teacher.name}</td>
                    <td className="py-2 pr-3">{teacher.phone}</td>
                    <td className="py-2 pr-3">{teacher.email}</td>
                    <td className="py-2 font-mono">
                      {teacher.existingAccount ? "Already had an account" : teacher.temporaryPassword}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button className="mt-6" onClick={() => router.push("/school/dashboard")}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Set up this school"
        description="Teachers first, then school sections (Pre-Primary, Primary, Secondary), then each class with its own name, subjects and fees."
        actions={
          <Link href="/school/setup">
            <Button variant="outline">Back to setup</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id < step || validateStep()) setStep(item.id);
            }}
            className={`rounded-full px-3 py-1 text-sm ${
              step === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {item.id + 1}. {item.title}
          </button>
        ))}
      </div>

      <Card className="max-w-3xl">
        <CardContent className="space-y-5 p-6">
          {step === 0 ? (
            <>
            <div>
                <Label>This session name</Label>
                <Input value={draft.yearName} onChange={(e) => patch({ yearName: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Starts</Label>
                  <Input type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
              </div>
              <div>
                <Label>Ends</Label>
                  <Input type="date" value={draft.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
                </div>
            </div>
            <div>
              <Label>Exam papers</Label>
              <div className="mt-2">
                <ExamPapersEditor papers={papers} onChange={setPapers} />
              </div>
            </div>
            <div>
                <Label>Minimum quizzes per subject</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.minQuizzes}
                  onChange={(e) => patch({ minQuizzes: e.target.value })}
                />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Add every teacher with a phone number. Emails and passwords are created for you.
              </p>
              {draft.teachers.map((teacher, index) => (
                <div key={teacher.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_10rem_auto]">
                  <div>
                    <Label>Full name</Label>
                    <Input
                      value={teacher.name}
                      placeholder={index === 0 ? "Ayesha Malik" : ""}
                      onChange={(e) => updateTeacher(teacher.key, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={teacher.phone}
                      placeholder="03xxxxxxxxx"
                      onChange={(e) => updateTeacher(teacher.key, { phone: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeTeacher(teacher.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addTeacher}>
                <Plus className="h-4 w-4" />
                Add teacher
              </Button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Define how this school is split — for example Pre-Primary (Level 1–2), Primary (Class 1–5), Secondary (Class 6–10).
                Name each school section here. On the next step, put every class into one of these sections.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_STAGES.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!draft.stages.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
                        addStage(name);
                      }
                    }}
                  >
                    {name}
                  </Button>
                ))}
              </div>
              {draft.stages.map((stage) => {
                const classNames = draft.classes
                  .filter((item) => item.stageKey === stage.key && item.name.trim())
                  .map((item) => item.name.trim());
                return (
                  <div key={stage.key} className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <div>
                        <Label>Section name</Label>
                        <Input
                          value={stage.name}
                          placeholder="Primary"
                          onChange={(e) => updateStage(stage.key, { name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Coordinator (optional)</Label>
                        <Select
                          value={stage.coordinatorKey}
                          onChange={(e) => updateStage(stage.key, { coordinatorKey: e.target.value })}
                        >
                          <option value="">None</option>
                          {draft.teachers
                            .filter((item) => item.name.trim())
                            .map((teacher) => (
                              <option key={teacher.key} value={teacher.key}>
                                {teacherLabel.get(teacher.key)}
                              </option>
                            ))}
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeStage(stage.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {classNames.length
                        ? `Classes in this section: ${classNames.join(", ")}`
                        : "No classes assigned yet — add them on the next step and choose this section."}
                    </p>
                  </div>
                );
              })}
              <Button type="button" variant="outline" onClick={() => addStage()}>
                <Plus className="h-4 w-4" />
                Add section
              </Button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {draft.classes.length ? (
                <div className="space-y-2">
                  {draft.classes.map((item) => (
                    <div key={item.key} className="flex items-start justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {draft.stages.find((stage) => stage.key === item.stageKey)?.name || "No section"}
                          {item.classTeacherKey ? ` · ${teacherLabel.get(item.classTeacherKey)}` : ""}
                          {" · "}
                          {item.subjects.filter((subject) => subject.name.trim()).map((subject) => subject.name).join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => editClass(item)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => patch({ classes: draft.classes.filter((row) => row.key !== item.key) })}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add each class and assign it to a school section (Pre-Primary, Primary, Secondary). Set admission and monthly tuition per class.
                </p>
              )}

              <div className="space-y-3 rounded-md border p-4">
                <p className="font-medium">{draft.classes.some((item) => item.key === classForm.key) ? "Edit class" : "New class"}</p>
                <div>
                  <Label>Class name</Label>
                  <Input
                    value={classForm.name}
                    placeholder="Level 1 / KG1 / FS1 / Class 6"
                    onChange={(e) => setClassForm((current) => ({ ...current, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>School section</Label>
                    <Select
                      value={classForm.stageKey}
                      onChange={(e) => setClassForm((current) => ({ ...current, stageKey: e.target.value }))}
                    >
                      <option value="">Select section</option>
                      {draft.stages
                        .filter((item) => item.name.trim())
                        .map((stage) => (
                          <option key={stage.key} value={stage.key}>
                            {stage.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Class teacher</Label>
                    <Select
                      value={classForm.classTeacherKey}
                      onChange={(e) => setClassForm((current) => ({ ...current, classTeacherKey: e.target.value }))}
                    >
                      <option value="">Not assigned yet</option>
                      {draft.teachers
                        .filter((item) => item.name.trim())
                        .map((teacher) => (
                          <option key={teacher.key} value={teacher.key}>
                            {teacherLabel.get(teacher.key)}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Admission fee</Label>
                    <Input
                      type="number"
                      min={0}
                      value={classForm.admissionFee}
                      onChange={(e) => setClassForm((current) => ({ ...current, admissionFee: e.target.value }))}
                    />
            </div>
            <div>
                    <Label>Monthly tuition</Label>
                    <Input
                      type="number"
                      min={0}
                      value={classForm.tuitionFee}
                      onChange={(e) => setClassForm((current) => ({ ...current, tuitionFee: e.target.value }))}
                    />
                  </div>
                </div>
                {draft.classes.length ? (
                  <div>
                    <Label>Copy subjects from another class</Label>
                    <Select value={copyFrom} onChange={(e) => applyCopy(e.target.value)}>
                      <option value="">Don’t copy</option>
                      {draft.classes
                        .filter((item) => item.key !== classForm.key)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label>Subjects</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SUGGESTED_SUBJECTS.map((name) => (
                      <Button
                        key={name}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (classForm.subjects.some((subject) => subject.name.trim().toLowerCase() === name.toLowerCase())) return;
                          const blank = classForm.subjects.find((subject) => !subject.name.trim());
                          if (blank) {
                            setClassForm((current) => ({
                              ...current,
                              subjects: current.subjects.map((subject) =>
                                subject.key === blank.key ? { ...subject, name } : subject,
                              ),
                            }));
                          } else {
                            setClassForm((current) => ({
                              ...current,
                              subjects: [...current.subjects, { key: uid(), name, teacherKey: "" }],
                            }));
                          }
                        }}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">
                    {classForm.subjects.map((subject) => (
                      <div key={subject.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          placeholder="Subject name"
                          value={subject.name}
                          onChange={(e) =>
                            setClassForm((current) => ({
                              ...current,
                              subjects: current.subjects.map((row) =>
                                row.key === subject.key ? { ...row, name: e.target.value } : row,
                              ),
                            }))
                          }
                        />
                        <Select
                          value={subject.teacherKey}
                          onChange={(e) =>
                            setClassForm((current) => ({
                              ...current,
                              subjects: current.subjects.map((row) =>
                                row.key === subject.key ? { ...row, teacherKey: e.target.value } : row,
                              ),
                            }))
                          }
                        >
                          <option value="">Subject teacher</option>
                          {draft.teachers
                            .filter((item) => item.name.trim())
                            .map((teacher) => (
                              <option key={teacher.key} value={teacher.key}>
                                {teacherLabel.get(teacher.key)}
                              </option>
                            ))}
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setClassForm((current) => ({
                              ...current,
                              subjects:
                                current.subjects.length === 1
                                  ? [emptySubject()]
                                  : current.subjects.filter((row) => row.key !== subject.key),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setClassForm((current) => ({ ...current, subjects: [...current.subjects, emptySubject()] }))}
                  >
                    <Plus className="h-4 w-4" />
                    Add subject
                  </Button>
                </div>
                <Button type="button" onClick={saveClass}>
                  {draft.classes.some((item) => item.key === classForm.key) ? "Save class" : "Add this class"}
                </Button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 text-sm">
              <p>
                <span className="font-medium">{draft.yearName}</span> · {draft.startDate} to {draft.endDate}
              </p>
              <p>{draft.teachers.filter((item) => item.name.trim()).length} teachers</p>
              <p>
                Sections:{" "}
                {draft.stages
                  .filter((item) => item.name.trim())
                  .map((item) => item.name)
                  .join(", ")}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.classes.map((item) => (
                  <li key={item.key}>
                    {item.name} ({draft.stages.find((stage) => stage.key === item.stageKey)?.name || "—"})
                    {item.admissionFee ? ` · admission ${item.admissionFee}` : ""}
                    {item.tuitionFee ? ` · tuition ${item.tuitionFee}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
              Back
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                onClick={() => {
                  if (validateStep()) setStep((value) => value + 1);
                }}
              >
                Next
              </Button>
            ) : (
              <Button type="button" disabled={run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? "Creating…" : "Create school setup"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
