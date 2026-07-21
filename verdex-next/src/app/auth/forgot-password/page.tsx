"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });
  const supabase = createClient();

  async function onSubmit(data: Values) {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="w-16 h-16 text-vdx-green mx-auto mb-4 drop-shadow-[0_0_20px_rgba(36,229,150,0.5)]" />
          <h2 className="font-heading text-2xl font-800 gradient-text-warm mb-3">Check Your Email</h2>
          <p className="text-vdx-muted text-sm mb-6">Password reset link sent. Click the link in your email to reset your password.</p>
          <Link href="/auth/sign-in" className="btn-primary px-8 py-3">Back to Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 grid-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <svg viewBox="0 0 100 160" className="w-12 h-12 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(36,229,150,0.5)] animate-float">
              <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
              <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
              <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
              <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
            </svg>
          </Link>
          <h1 className="font-heading text-3xl font-800 tracking-tight gradient-text-warm">Reset Password</h1>
          <p className="text-vdx-muted text-sm mt-2">Enter your email and we'll send a reset link.</p>
        </div>
        <div className="glass-darker rounded-2xl p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">Email</label>
              <input {...register("email")} type="email" placeholder="you@example.com" className={cn("vdx-input", errors.email && "border-vdx-error/50")} />
              {errors.email && <p className="text-xs text-vdx-error mt-1">{errors.email.message}</p>}
              {error && <p className="text-xs text-vdx-error mt-1">{error}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base justify-center">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</> : "Send Reset Link"}
            </button>
          </form>
          <p className="text-center text-sm text-vdx-muted mt-4">
            <Link href="/auth/sign-in" className="text-vdx-green hover:text-vdx-bright font-semibold">Back to Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
