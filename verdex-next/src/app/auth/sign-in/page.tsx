"use client";

export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignInValues = z.infer<typeof signInSchema>;

function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const supabase = createClient();

  const { register, handleSubmit, formState: { errors } } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(data: SignInValues) {
    setLoading(true);
    setServerError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      setServerError(error.message);
      setLoading(false);
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 grid-bg relative">
      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-vdx-green/8 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="mb-4">
            <svg viewBox="0 0 100 160" className="w-12 h-12 drop-shadow-[0_0_20px_rgba(36,229,150,0.5)] animate-float">
              <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
              <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
              <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
              <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
            </svg>
          </Link>
          <h1 className="font-heading text-3xl font-800 tracking-tight gradient-text-warm">Welcome Back</h1>
          <p className="text-vdx-muted text-sm mt-2">Sign in to access your mining dashboard and wallet</p>
        </div>

        {/* Security warning */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[rgba(255,92,108,0.08)] border border-[rgba(255,92,108,0.2)] mb-6">
          <ShieldAlert className="w-4 h-4 text-vdx-error flex-shrink-0 mt-0.5" />
          <p className="text-xs text-vdx-muted leading-relaxed">
            <strong className="text-vdx-error">Security notice:</strong> Verdex will <em>never</em> ask for your seed phrase, private key, or miner authentication secret. Only sign in on{" "}
            <span className="font-mono text-vdx-green">verdexswap.site</span>
          </p>
        </div>

        {/* Form card */}
        <div className="glass-darker rounded-2xl p-7 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={cn(
                  "vdx-input",
                  errors.email && "border-vdx-error/50 focus:shadow-[0_0_0_3px_rgba(255,92,108,0.12)]"
                )}
              />
              {errors.email && (
                <p className="text-xs text-vdx-error mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold">Password</label>
                <Link href="/auth/forgot-password" className="text-xs text-vdx-green hover:text-vdx-bright transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    "vdx-input pr-10",
                    errors.password && "border-vdx-error/50"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vdx-muted hover:text-vdx-text transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-vdx-error mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Server error */}
            {serverError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[rgba(255,92,108,0.1)] border border-[rgba(255,92,108,0.25)]">
                <AlertTriangle className="w-4 h-4 text-vdx-error flex-shrink-0 mt-0.5" />
                <p className="text-xs text-vdx-error">{serverError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 text-base justify-center mt-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign In"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[rgba(87,255,179,0.1)]" />
            <span className="text-xs text-vdx-muted">or</span>
            <div className="flex-1 h-px bg-[rgba(87,255,179,0.1)]" />
          </div>

          <p className="text-center text-sm text-vdx-muted">
            No account?{" "}
            <Link href="/auth/register" className="text-vdx-green hover:text-vdx-bright font-semibold transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-vdx-green" /></div>}>
      <SignInForm />
    </Suspense>
  );
}
