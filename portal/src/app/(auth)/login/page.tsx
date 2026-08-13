import { LoginForm } from "@/components/auth/login-form";
import { GraduationCap } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-accent/30 to-background p-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="h-7 w-7" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">SMS Portal</h1>
          <p className="text-sm text-muted-foreground">School & Teacher access</p>
        </div>
      </div>
      <LoginForm
        title="Sign in"
        description="School administrators and teachers"
      />
      <p className="mt-6 text-sm text-muted-foreground">
        Super admin?{" "}
        <Link href="/super-admin/login" className="font-medium text-primary hover:underline">
          Go to control center
        </Link>
      </p>
    </div>
  );
}
