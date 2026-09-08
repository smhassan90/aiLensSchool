"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { Layers, Plus } from "lucide-react";

export default function SchoolSectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const stages = useQuery({
    queryKey: ["school-stages"],
    queryFn: () => academicsService.listStages(),
  });

  const create = useMutation({
    mutationFn: () => academicsService.createStage({ name: name.trim(), sortOrder: (stages.data?.length ?? 0) + 1 }),
    onSuccess: () => {
      toast({ title: "School section created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["school-stages"] });
      setName("");
      setOpen(false);
    },
    onError: (err) =>
      toast({
        title: "Could not create section",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="School sections"
        description="How this school is split — e.g. Pre-Primary (Level 1–2), Primary (1–5), Secondary (6–10). Assign classes on the Classes page."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add section
          </Button>
        }
      />

      {stages.isLoading ? (
        <PageLoader variant="panel" />
      ) : !stages.data?.length ? (
        <EmptyState
          icon={<Layers className="h-10 w-10" />}
          title="No school sections yet"
          description="Add Pre-Primary, Primary, Secondary — or whatever names this school uses — then put classes under them."
          action={<Button onClick={() => setOpen(true)}>Add section</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stages.data.map((stage) => (
            <Card key={stage.id}>
              <CardHeader>
                <CardTitle>{stage.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {stage.grades?.length ? (
                  <p>
                    Classes: {stage.grades.map((grade) => grade.name).join(", ")}
                  </p>
                ) : (
                  <p>No classes assigned yet. Open Classes and set School section on each class.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add school section</DialogTitle>
            <DialogDescription>
              This is the bifurcation of the school (Pre-Primary / Primary / Secondary), not classroom A/B.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="stageName">Section name</Label>
            <Input
              id="stageName"
              value={name}
              placeholder="Primary"
              onChange={(e) => setName(e.target.value)}
            />
            <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
