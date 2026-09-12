"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { academicsService } from "@/services/academics.service";
import { studentsService } from "@/services/students.service";
import { feesService } from "@/services/fees.service";
import { teacherDisplayNameFromUser, personFullName } from "@/lib/person-name";
import { formatPkr } from "@/lib/money";
import { ArrowLeft, Users, Wallet } from "lucide-react";

export default function ClassSnapshotPage() {
  const params = useParams<{ sectionId: string }>();
  const sectionId = params.sectionId;

  const section = useQuery({
    queryKey: ["section", sectionId],
    queryFn: () => academicsService.getSection(sectionId),
  });
  const students = useQuery({
    queryKey: ["students", "", sectionId, "", "ACTIVE"],
    queryFn: () => studentsService.list({ sectionId, status: "ACTIVE", limit: 50 }),
    enabled: Boolean(sectionId),
  });
  const unpaid = useQuery({
    queryKey: ["fees-due-month", sectionId],
    queryFn: () => feesService.listDueThisMonth({ sectionId, limit: 100 }),
    enabled: Boolean(sectionId),
  });
  const collected = useQuery({
    queryKey: ["fee-collections", sectionId],
    queryFn: () => feesService.listCollectionsThisMonth({ sectionId, limit: 20 }),
    enabled: Boolean(sectionId),
  });

  const row = section.data;
  const className = row ? `${row.grade?.name ?? ""} ${row.name}`.trim() : "Class";
  const dueItems = [...(unpaid.data?.unpaid ?? []), ...(unpaid.data?.partial ?? [])];
  const dueTotal = dueItems.reduce((sum, item) => sum + Number(item.balance ?? 0), 0);

  if (section.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Class" description="Roster, teachers, and this month’s fees." />
        <PageLoader variant="page" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="Class not found"
          action={
            <Link href="/school/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={className}
        description={`${row._count?.enrollments ?? students.data?.total ?? 0} students · ${row.branch?.name ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/school/dashboard">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link href={`/school/academics/grades/${row.gradeId}`}>
              <Button variant="outline">Manage class</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href={`/school/students?sectionId=${sectionId}&status=ACTIVE`} className="block">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Students</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{row._count?.enrollments ?? students.data?.total ?? 0}</p>
              <p className="mt-2 text-xs font-medium text-primary">Open roster →</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/school/fees?view=collected&sectionId=${sectionId}`} className="block">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Collected this month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatPkr(collected.data?.totalAmount ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{collected.data?.total ?? 0} payments</p>
              <p className="mt-2 text-xs font-medium text-primary">Open collections →</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/school/fees?view=due&sectionId=${sectionId}`} className="block">
          <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Still due this month</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatPkr(dueTotal)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {unpaid.data?.unpaid.length ?? 0} unpaid · {unpaid.data?.partial.length ?? 0} partial
              </p>
              <p className="mt-2 text-xs font-medium text-primary">Open dues →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who teaches this class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Class teacher</p>
              {row.classTeacher ? (
                <Link href={`/school/teachers/${row.classTeacher.id}`} className="font-medium hover:underline">
                  {teacherDisplayNameFromUser(row.classTeacher.user, row.classTeacher.gender)}
                </Link>
              ) : (
                <p className="font-medium text-amber-700">Not assigned</p>
              )}
            </div>
            {(row.classSubjects ?? []).length ? (
              <ul className="space-y-2">
                {(row.classSubjects ?? []).map((item) => (
                  <li key={item.id ?? `${item.subjectId}-${item.teacherId}`} className="flex items-center justify-between gap-3 text-sm">
                    <span>{item.subject?.name ?? "Subject"}</span>
                    {item.teacher ? (
                      <Link href={`/school/teachers/${item.teacher.id}`} className="text-primary hover:underline">
                        {teacherDisplayNameFromUser(item.teacher.user, item.teacher.gender)}
                      </Link>
                    ) : (
                      <span className="text-amber-700">Unassigned</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No subject teachers yet. Assign them from Manage class.</p>
            )}
            {row.grade?.tuitionFee != null ? (
              <p className="text-sm text-muted-foreground">
                Monthly tuition {formatPkr(row.grade.tuitionFee)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Fees still due</CardTitle>
            <Link href={`/school/fees?view=due&sectionId=${sectionId}`}>
              <Button size="sm" variant="outline">All dues</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {unpaid.isLoading ? (
              <PageLoader variant="panel" />
            ) : !dueItems.length ? (
              <p className="text-sm text-muted-foreground">No unpaid or partial bills this month.</p>
            ) : (
              <ul className="divide-y">
                {dueItems.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {item.student
                        ? personFullName(item.student.firstName, item.student.lastName)
                        : "Student"}
                      <span className="ml-2">
                        <Badge variant={item.status === "PARTIAL" ? "warning" : "destructive"}>
                          {item.status === "PARTIAL" ? "Partial" : "Unpaid"}
                        </Badge>
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {formatPkr(item.balance)}
                      {item.student ? (
                        <Link href={`/school/fees?studentId=${item.student.id}`}>
                          <Button size="sm" variant="outline">Collect</Button>
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Roster</CardTitle>
          <Link href={`/school/students?sectionId=${sectionId}&status=ACTIVE`}>
            <Button size="sm" variant="outline">All students</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {students.isLoading ? (
            <PageLoader variant="panel" />
          ) : !students.data?.items.length ? (
            <EmptyState
              icon={<Users className="h-10 w-10" />}
              title="No students in this class"
              description="Enrol children from the class page."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.data.items.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      <Link href={`/school/students/${student.id}`} className="hover:underline">
                        {personFullName(student.firstName, student.lastName)}
                      </Link>
                    </TableCell>
                    <TableCell>{student.studentCode}</TableCell>
                    <TableCell>
                      <Badge variant={student.status === "ACTIVE" ? "success" : "secondary"}>
                        {student.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/school/fees?studentId=${student.id}`}>
                        <Button size="sm" variant="outline">
                          <Wallet className="h-4 w-4" />
                          Fees
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
