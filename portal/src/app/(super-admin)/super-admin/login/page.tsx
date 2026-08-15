import { LoginForm } from "@/components/auth/login-form";
import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";

export default function SuperAdminLoginPage() {
  return (
    <div className="theme-super-admin flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6">
      <div className="mb-8">
        <BrandMark variant="full" subtitle="Super Admin access only" />
      </div>
      <div className="relative w-full max-w-md">
        <LoginForm
          expectedRole="SUPER_ADMIN"
          title="Super Admin Sign In"
          description="Platform administration and oversight"
          redirectOverride="/super-admin/dashboard"
        />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        School portal?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to school login
        </Link>
      </p>
    </div>
  );
}
