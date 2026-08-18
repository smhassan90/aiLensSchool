"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Profile" description="Your teacher account" />
      <Card className="max-w-xl">
        <CardHeader><CardTitle>{user?.firstName} {user?.lastName}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
          <p><span className="text-muted-foreground">Role:</span> {(user?.roles ?? []).join(", ")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
