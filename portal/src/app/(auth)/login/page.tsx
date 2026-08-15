import { LoginForm } from "@/components/auth/login-form";
import { BrandMark } from "@/components/brand/brand-mark";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="mb-8">
        <BrandMark variant="full" subtitle="School & teacher access" />
      </div>
      <div className="relative w-full max-w-md">
        <LoginForm
          title="Sign in"
          description="School administrators and teachers"
        />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Super admin?{" "}
        <Link href="/super-admin/login" className="font-medium text-primary hover:underline">
          Go to control center
        </Link>
      </p>
    </div>
  );
}
