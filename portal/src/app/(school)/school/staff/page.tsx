"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/layout/access-denied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { staffService } from "@/services/school-ops.service";
import type { StaffPermission } from "@/lib/types";
import { useToast } from "@/providers/toast-provider";
import { useAuth } from "@/providers/auth-provider";
import { friendlyApiErrorMessage, formatRolesList } from "@/lib/display-labels";
import type { RoleName } from "@/lib/types";

const STAFF_ROLES = [
  {
    title: "Principal",
    permissions: ["VIEW_DASHBOARD", "SEARCH_STUDENTS", "VIEW_TEACHER_PROGRESS", "VIEW_FINANCE"] as StaffPermission[],
  },
  {
    title: "Vice Principal",
    permissions: ["VIEW_DASHBOARD", "SEARCH_STUDENTS", "VIEW_TEACHER_PROGRESS", "MANAGE_TEACHERS", "MANAGE_CLASSES"] as StaffPermission[],
  },
  {
    title: "Accountant",
    permissions: ["VIEW_FINANCE", "MANAGE_EXPENSES"] as StaffPermission[],
  },
  {
    title: "Front desk",
    permissions: ["VIEW_DASHBOARD", "SEARCH_STUDENTS"] as StaffPermission[],
  },
  {
    title: "Coordinator",
    permissions: ["VIEW_DASHBOARD", "VIEW_TEACHER_PROGRESS", "MANAGE_CLASSES", "SET_QUIZ_TARGETS"] as StaffPermission[],
  },
] as const;

export default function StaffPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["staff-permissions"], queryFn: () => staffService.permissions() });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => staffService.list({ limit: 50 }) });
  const [title, setTitle] = useState<string>(STAFF_ROLES[0].title);
  const selectedRole = useMemo(
    () => STAFF_ROLES.find((role) => role.title === title) ?? STAFF_ROLES[0],
    [title],
  );
  const [permissions, setPermissions] = useState<StaffPermission[]>([...STAFF_ROLES[0].permissions]);

  const create = useMutation({
    mutationFn: (payload: {
      firstName: string;
      lastName: string;
      email?: string;
      phone: string;
      password: string;
      employeeCode?: string;
    }) =>
      staffService.create({
        ...payload,
        title: selectedRole.title,
        role: "PRINCIPAL",
        permissions,
      }),
    onSuccess: (data: { username?: string | null }) => {
      const login = data?.username ? ` Sign-in username: ${data.username}` : "";
      toast({ title: "Account created", description: login.trim() || undefined, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not create", description: friendlyApiErrorMessage(err), variant: "error" }),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const employeeCode = String(data.get("employeeCode") ?? "").trim();
    create.mutate(
      {
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? ""),
        phone: String(data.get("phone") ?? ""),
        password: String(data.get("password") ?? ""),
        ...(email ? { email } : {}),
        ...(employeeCode ? { employeeCode } : {}),
      },
      { onSuccess: () => form.reset() },
    );
  };

  const toggle = (key: StaffPermission) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  if (!can("MANAGE_STAFF")) {
    return (
      <AccessDenied
        description="Only the main school admin can create staff logins. If you need access, contact your administrator."
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Staff access"
        description="Pick a role, then tick only what they need. Staff sign in with the school username created from their mobile number."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New account</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>First name</Label><Input name="firstName" required /></div>
                <div><Label>Last name</Label><Input name="lastName" required /></div>
              </div>
              <div>
                <Label>Mobile number</Label>
                <Input name="phone" type="tel" autoComplete="tel" required placeholder="e.g. 03001234567" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used to generate their login username (same style as teachers).
                </p>
              </div>
              <div>
                <Label>Email (optional)</Label>
                <Input name="email" type="email" placeholder="Only if they use email elsewhere" />
              </div>
              <div>
                <Label>Employee code (optional)</Label>
                <Input name="employeeCode" placeholder="Same as terminal user ID for fingerprint mapping" />
              </div>
              <div><Label>Password</Label><Input name="password" type="password" minLength={6} required /></div>
              <div>
                <Label>Role</Label>
                <Select
                  name="title"
                  value={title}
                  onChange={(e) => {
                    const next = STAFF_ROLES.find((role) => role.title === e.target.value) ?? STAFF_ROLES[0];
                    setTitle(next.title);
                    setPermissions([...next.permissions]);
                  }}
                >
                  {STAFF_ROLES.map((role) => (
                    <option key={role.title} value={role.title}>
                      {role.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">What can they do?</p>
                {(catalog.data ?? []).map((item) => (
                  <label key={item.key} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={permissions.includes(item.key)}
                      onChange={() => toggle(item.key)}
                    />
                    <span>
                      <span className="font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Create account"}</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Existing staff</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(staff.data?.items ?? []).map((person) => (
              <div key={person.id} className="rounded-md border p-3">
                <p className="font-medium">{person.firstName} {person.lastName}</p>
                <p className="text-muted-foreground">
                  {person.username ?? person.email}
                  {" · "}
                  {formatRolesList(person.roles as RoleName[])}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
