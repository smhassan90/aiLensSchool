"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import type { ClassSubject } from "@/lib/types";
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { gradeClassLabel } from "@/lib/utils";
import { BookOpen, GraduationCap, Search, UserSquare2 } from "lucide-react";

function classLabel(item: ClassSubject) {
  if (item.section?.grade) return gradeClassLabel(item.section);
  return item.section?.name ? `Section ${item.section.name}` : "—";
}

function sectionLabel(item: ClassSubject) {
  return item.section?.name ?? "—";
}

function teacherLabel(item: ClassSubject) {
  if (!item.teacher) return "—";
  return teacherDisplayNameFromUser(item.teacher.user, item.teacher.gender);
}

export function TeachingAssignmentsHub() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("teachers");

  const assignments = useQuery({
    queryKey: ["teaching-assignments"],
    queryFn: () =>
      fetchAllPages((page, limit) => academicsService.listClassSubjects({ page, limit })),
  });
  const teachers = useQuery({
    queryKey: ["teachers", "active"],
    queryFn: () =>
      fetchAllPages((page, limit) => teachersService.list({ page, limit, status: "ACTIVE" })),
  });

  const items = assignments.data ?? [];
  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return items;
    return items.filter((item) => {
      const blob = [
        classLabel(item),
        sectionLabel(item),
        item.subject?.name,
        item.subject?.code,
        teacherLabel(item),
        item.assistantTeacher
          ? teacherDisplayNameFromUser(item.assistantTeacher.user, item.assistantTeacher.gender)
          : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [items, q]);

  const byTeacher = useMemo(() => {
    const map = new Map<
      string,
      { name: string; teacherId: string; rows: ClassSubject[] }
    >();
    for (const item of filtered) {
      if (item.teacherId && item.teacher) {
        const existing = map.get(item.teacherId);
        if (existing) existing.rows.push(item);
        else
          map.set(item.teacherId, {
            teacherId: item.teacherId,
            name: teacherLabel(item),
            rows: [item],
          });
      }
      if (item.assistantTeacherId && item.assistantTeacher) {
        const existing = map.get(item.assistantTeacherId);
        const row = { ...item, teacher: item.assistantTeacher, teacherId: item.assistantTeacherId };
        if (existing) existing.rows.push(row);
        else
          map.set(item.assistantTeacherId, {
            teacherId: item.assistantTeacherId,
            name: teacherDisplayNameFromUser(
              item.assistantTeacher.user,
              item.assistantTeacher.gender,
            ),
            rows: [row],
          });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const bySection = useMemo(() => {
    const map = new Map<string, { key: string; title: string; subtitle: string; rows: ClassSubject[] }>();
    for (const item of filtered) {
      const key = item.sectionId;
      const title = `${classLabel(item)} · Section ${sectionLabel(item)}`;
      const existing = map.get(key);
      if (existing) existing.rows.push(item);
      else map.set(key, { key, title, subtitle: item.academicYear?.name ?? "Current year", rows: [item] });
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered]);

  const bySubject = useMemo(() => {
    const map = new Map<string, { subjectId: string; name: string; rows: ClassSubject[] }>();
    for (const item of filtered) {
      const existing = map.get(item.subjectId);
      if (existing) existing.rows.push(item);
      else
        map.set(item.subjectId, {
          subjectId: item.subjectId,
          name: item.subject?.name ?? "Subject",
          rows: [item],
        });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const unassigned = filtered.filter((item) => !item.teacherId).length;
  const teacherList = teachers.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teaching assignments"
        description="See who teaches what — by teacher, class section, or subject. Open a teacher to change assignments."
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search class, section, subject, or teacher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{filtered.length} slots</Badge>
          <Badge variant={unassigned ? "warning" : "success"}>
            {unassigned ? `${unassigned} need a teacher` : "All slots staffed"}
          </Badge>
        </div>
      </div>

      {assignments.isLoading ? (
        <PageLoader variant="panel" />
      ) : (
        <Tabs defaultValue="teachers" value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="teachers">
              <UserSquare2 className="mr-1.5 h-4 w-4" />
              By teacher
            </TabsTrigger>
            <TabsTrigger value="sections">
              <GraduationCap className="mr-1.5 h-4 w-4" />
              By class & section
            </TabsTrigger>
            <TabsTrigger value="subjects">
              <BookOpen className="mr-1.5 h-4 w-4" />
              By subject
            </TabsTrigger>
            <TabsTrigger value="matrix">Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="teachers" className="space-y-4">
            {byTeacher.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teaching assignments match your search.</p>
            ) : (
              byTeacher.map((group) => (
                <Card key={group.teacherId}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base">
                      <Link
                        href={`/school/teachers/${group.teacherId}/overview`}
                        className="hover:underline"
                      >
                        {group.name}
                      </Link>
                    </CardTitle>
                    <Link href={`/school/teachers/${group.teacherId}`}>
                      <Badge variant="outline">Manage</Badge>
                    </Link>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1 text-sm">
                      {group.rows.map((item) => (
                        <li key={`${item.id}-${item.teacherId}`} className="flex flex-wrap gap-x-2">
                          <span className="font-medium">{classLabel(item)}</span>
                          <span className="text-muted-foreground">· Section {sectionLabel(item)}</span>
                          <span>· {item.subject?.name}</span>
                          {item.assistantTeacherId === group.teacherId &&
                          item.teacherId !== group.teacherId ? (
                            <Badge variant="secondary" className="text-xs">Assistant</Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))
            )}
            {teacherList.length > byTeacher.length ? (
              <p className="text-xs text-muted-foreground">
                {teacherList.length - byTeacher.length} active teacher
                {teacherList.length - byTeacher.length === 1 ? "" : "s"} with no subject assignments yet.
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="sections" className="space-y-4">
            {bySection.map((group) => (
              <Card key={group.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{group.subtitle}</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Assistant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.subject?.name}</TableCell>
                          <TableCell>
                            {item.teacher ? (
                              <Link
                                href={`/school/teachers/${item.teacherId}/overview`}
                                className="hover:underline"
                              >
                                {teacherLabel(item)}
                              </Link>
                            ) : (
                              <Badge variant="warning">Unassigned</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.assistantTeacher
                              ? teacherDisplayNameFromUser(
                                  item.assistantTeacher.user,
                                  item.assistantTeacher.gender,
                                )
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="subjects" className="space-y-4">
            {bySubject.map((group) => (
              <Card key={group.subjectId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{group.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Teacher</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{classLabel(item)}</TableCell>
                          <TableCell>{sectionLabel(item)}</TableCell>
                          <TableCell>
                            {item.teacherId ? (
                              <Link
                                href={`/school/teachers/${item.teacherId}/overview`}
                                className="hover:underline"
                              >
                                {teacherLabel(item)}
                              </Link>
                            ) : (
                              <Badge variant="warning">Unassigned</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="matrix">
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Assistant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{classLabel(item)}</TableCell>
                      <TableCell>{sectionLabel(item)}</TableCell>
                      <TableCell>{item.subject?.name}</TableCell>
                      <TableCell>
                        {item.teacherId ? (
                          <Link
                            href={`/school/teachers/${item.teacherId}/overview`}
                            className="hover:underline"
                          >
                            {teacherLabel(item)}
                          </Link>
                        ) : (
                          <Badge variant="warning">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.assistantTeacher
                          ? teacherDisplayNameFromUser(
                              item.assistantTeacher.user,
                              item.assistantTeacher.gender,
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
