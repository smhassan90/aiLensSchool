"use client";

import { GlobalSearch } from "@/components/layout/global-search";
import { PageHeader } from "@/components/layout/page-header";

export default function FrontDeskPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Find a child"
        description="Type student ID, parent phone, or parent name. Open the child to see everything in one place."
      />
      <div className="max-w-xl">
        <GlobalSearch />
        <p className="mt-4 text-sm text-muted-foreground">
          Opening a parent shows all of their children together.
        </p>
      </div>
    </div>
  );
}
