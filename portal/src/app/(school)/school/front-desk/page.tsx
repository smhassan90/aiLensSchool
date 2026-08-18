"use client";

import { GlobalSearch } from "@/components/layout/global-search";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FrontDeskPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Find a child"
        description="Type student ID, parent phone, or parent name. Open the child to see everything in one place."
      />
      <Card className="max-w-3xl">
        <CardHeader><CardTitle>Find parent or child</CardTitle></CardHeader>
        <CardContent>
          <GlobalSearch />
          <p className="mt-4 text-sm text-muted-foreground">
            Search works on student name, admission number, parent name, email and phone. Opening a parent shows all children side by side.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
