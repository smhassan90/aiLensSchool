"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicsService } from "@/services/academics.service";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { Calendar } from "lucide-react";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const DAY_LABEL: Record<(typeof DAYS)[number], string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

function teacherLabel(
  teacher?: {
    gender?: string | null;
    user?: { firstName: string; lastName: string } | null;
  } | null,
) {
  if (!teacher?.user) return "";
  return teacherDisplayNameFromUser(teacher.user, teacher.gender);
}

export default function TimetablePage() {
  const [gradeId, setGradeId] = useState("");
  const grades = useQuery({
    queryKey: ["grades"],
    queryFn: () => academicsService.listGrades({ limit: 100 }),
  });
  const selected = gradeId || grades.data?.items.find((item) => item.name === "Class 1")?.id || grades.data?.items[0]?.id || "";
  const table = useQuery({
    queryKey: ["timetable", selected],
    queryFn: () => academicsService.listTimetable(selected),
    enabled: Boolean(selected),
  });

  const periods = useMemo(() => {
    const numbers = Array.from(new Set((table.data?.slots ?? []).map((slot) => slot.periodNumber))).sort(
      (a, b) => a - b,
    );
    return numbers.map((number) => {
      const sample = table.data?.slots.find((slot) => slot.periodNumber === number);
      return { number, startTime: sample?.startTime, endTime: sample?.endTime };
    });
  }, [table.data]);

  const grid = useMemo(() => {
    const map = new Map<string, (typeof table.data.slots)[number]>();
    for (const slot of table.data?.slots ?? []) {
      map.set(`${slot.periodNumber}-${slot.weekday}`, slot);
    }
    return map;
  }, [table.data]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Timetable"
        description={
          table.data?.section?.classTeacher
            ? `Class teacher: ${teacherLabel(table.data.section.classTeacher)}`
            : "Weekly periods from the school time tables"
        }
      />
      <div className="mb-4 max-w-xs">
        <Select value={selected} onChange={(e) => setGradeId(e.target.value)}>
          <option value="">Select class</option>
          {grades.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>

      {table.isLoading ? (
        <PageLoader variant="page" />
      ) : table.data?.pattern === "CLASS_TEACHER" ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">
              Pre-primary does not follow a period timetable. The class teacher teaches every subject.
            </p>
            {table.data.section?.classTeacher ? (
              <p className="text-lg font-medium">
                Class teacher: {teacherLabel(table.data.section.classTeacher)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No class teacher assigned yet.</p>
            )}
            {(table.data.subjects ?? []).length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {table.data.subjects.map((subject) => (
                  <li key={subject.id}>
                    {subject.name}
                    {subject.teacher ? ` · ${teacherLabel(subject.teacher)}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No named subject list is stored for this class. The class teacher covers the whole day.
              </p>
            )}
          </CardContent>
        </Card>
      ) : !periods.length ? (
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="No weekly timetable yet"
          description={
            /class\s*(9|10)/i.test(table.data?.grade?.name ?? "")
              ? "Class 9 and 10 still need their weekly time table sheet. Subjects and some teachers are already stored."
              : "Time tables for this class have not been stored."
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Period</TableHead>
                  {DAYS.map((day) => (
                    <TableHead key={day}>{DAY_LABEL[day]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period.number}>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">{period.number}</div>
                      {period.startTime && period.endTime ? (
                        <div>
                          {period.startTime}–{period.endTime}
                        </div>
                      ) : null}
                    </TableCell>
                    {DAYS.map((day) => {
                      const slot = grid.get(`${period.number}-${day}`);
                      return (
                        <TableCell key={day} className="align-top">
                          {slot ? (
                            <>
                              <div className="font-medium">{slot.title}</div>
                              {slot.teacher ? (
                                <div className="text-sm text-muted-foreground">{teacherLabel(slot.teacher)}</div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
