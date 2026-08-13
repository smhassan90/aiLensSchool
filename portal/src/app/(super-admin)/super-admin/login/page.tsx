import { LoginForm } from "@/components/auth/login-form";
import { Shield } from "lucide-react";
import Link from "next/link";

export default function SuperAdminLoginPage() {
  return (
    <div className="theme-super-admin flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="mb-8 flex items-center gap-3 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-accent">
          <Shield className="h-7 w-7" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">SMS Control Center</h1>
          <p className="text-sm text-slate-300">Super Admin access only</p>
        </div>
      </div>
      <LoginForm
        expectedRole="SUPER_ADMIN"
        title="Super Admin Sign In"
        description="Platform administration and oversight"
        redirectOverride="/super-admin/dashboard"
      />
      <p className="mt-6 text-sm text-slate-400">
        School portal?{" "}
        <Link href="/login" className="font-medium text-teal-300 hover:underline">
          Back to school login
        </Link>
      </p>
    </div>
  );
}
