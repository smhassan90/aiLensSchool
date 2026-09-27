"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";
import { personFullName } from "@/lib/person-name";
import { formatRolesList, profileLoginLabel } from "@/lib/display-labels";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const login = profileLoginLabel(user ?? {});
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile" description="Your teacher account" />
      <Card className="max-w-xl">
        <CardHeader><CardTitle>{personFullName(user?.firstName, user?.lastName)}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">{login.label}:</span> {login.value}</p>
          <p><span className="text-muted-foreground">Role:</span> {formatRolesList(user?.roles)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
