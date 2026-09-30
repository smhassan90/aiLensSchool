"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { ArrowLeft } from "lucide-react";
import { Teacher360View } from "@/components/teachers/teacher-360-view";
import { TeacherResetPasswordDialog } from "@/components/teachers/teacher-reset-password-dialog";
import { useQuery } from "@tanstack/react-query";
import { teachersService } from "@/services/teachers.service";
import { teacherDisplayNameFromUser } from "@/lib/person-name";

export default function TeacherOverviewPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();
  const allowed = can("VIEW_TEACHER_PROGRESS") || can("MANAGE_TEACHERS");
  const teacherMeta = useQuery({
    queryKey: ["teacher", params.id, "meta"],
    queryFn: () => teachersService.getById(params.id),
    enabled: allowed && can("MANAGE_TEACHERS") && Boolean(params.id),
  });
  const teacherName = teacherMeta.data
    ? teacherDisplayNameFromUser(teacherMeta.data.user, teacherMeta.data.gender)
    : "Teacher";

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">You do not have access to teacher overview.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Teacher360View
        teacherId={params.id}
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Link href="/school/teachers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                All teachers
              </Button>
            </Link>
            {can("MANAGE_TEACHERS") ? (
              <>
                <Link href={`/school/teachers/${params.id}`}>
                  <Button variant="outline">Edit profile</Button>
                </Link>
                <TeacherResetPasswordDialog teacherId={params.id} teacherName={teacherName} />
              </>
            ) : null}
            <Link href={`/school/teachers/${params.id}/progress`}>
              <Button variant="outline">AI progress</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}
