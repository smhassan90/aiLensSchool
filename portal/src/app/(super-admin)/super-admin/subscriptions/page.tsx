"use client";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Subscriptions" description="School subscription status" />
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            title="Coming soon"
            description="This section is scaffolded and ready for API integration."
          />
        </CardContent>
      </Card>
    </div>
  );
}
