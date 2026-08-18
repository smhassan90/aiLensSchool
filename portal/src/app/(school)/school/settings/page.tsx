"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { schoolsService } from "@/services/schools.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const schoolId = user?.schoolId ?? "";
  const showWizard = can("MANAGE_CLASSES");

  const school = useQuery({
    queryKey: ["school", schoolId],
    queryFn: () => schoolsService.getById(schoolId),
    enabled: Boolean(schoolId),
  });

  useEffect(() => {
    if (!school.data) return;
    setName(school.data.name ?? "");
    setEmail(school.data.email ?? "");
    setPhone(school.data.phone ?? "");
    setAddress(school.data.address ?? "");
    setCity(school.data.city ?? "");
  }, [school.data]);

  const save = useMutation({
    mutationFn: () => schoolsService.update(schoolId, { name, email, phone, address, city }),
    onSuccess: () => {
      toast({ title: "Settings saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["school", schoolId] });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  if (school.isLoading) {
    return <PageLoader variant="page" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="School contact details used on ID cards and reports" />
      <Card className="max-w-xl">
        <CardContent className="space-y-3 pt-6">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
          <Button disabled={save.isPending || !schoolId} onClick={() => save.mutate()}>
            Save
          </Button>
        </CardContent>
      </Card>
      {showWizard ? (
        <Card className="mt-6 max-w-xl">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div>
              <p className="font-medium">First-time setup</p>
              <p className="text-sm text-muted-foreground">
                Create the year, classes, subjects and exam pattern in one go.
              </p>
            </div>
            <Link href="/school/setup/wizard">
              <Button variant="outline">Open wizard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
