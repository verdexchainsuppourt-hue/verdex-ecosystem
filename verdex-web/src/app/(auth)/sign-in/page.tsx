"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Chrome, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecurityWarning } from "@/components/shared/security-warning";
import { useAuth } from "@/components/auth/auth-provider";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, signInWithGoogle } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { remember: true },
  });

  async function onSubmit(values: FormValues) {
    try {
      await signIn(values.email, values.password);
      toast.success("Welcome back to Verdex");
      router.push(params.get("next") ?? "/dashboard");
    } catch (e) {
      toast.error("Sign-in failed", { description: e instanceof Error ? e.message : "Check your credentials." });
    }
  }

  async function google() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      toast.error("Google sign-in failed", { description: e instanceof Error ? e.message : undefined });
      setGoogleLoading(false);
    }
  }

  return (
    <Card className="edge-glow p-7 sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink">Sign in to Verdex</h1>
      <p className="mt-1.5 text-sm text-muted">Access your mining, wallet and rewards dashboard.</p>

      <button
        onClick={google}
        disabled={googleLoading}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-sm font-semibold text-ink transition-all hover:border-emerald/40 hover:bg-emerald/[0.06] disabled:opacity-50"
      >
        {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-faint">
        <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email" className="mb-1.5 block">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1.5 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/sign-in" className="text-xs text-emerald-bright hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-danger">{errors.password.message}</p>}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
          <input type="checkbox" {...register("remember")} className="h-4 w-4 rounded border-line bg-black/40 accent-emerald" />
          Remember me on this device
        </label>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign In
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        New to Verdex?{" "}
        <Link href="/register" className="font-semibold text-emerald-bright hover:underline">Create an account</Link>
      </p>

      <SecurityWarning className="mt-6" compact />
    </Card>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<Card className="h-[520px] animate-pulse" />}>
      <SignInForm />
    </Suspense>
  );
}
