"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, AlertTriangle, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
  terms: z.boolean().refine((val) => val === true, { message: "You must accept the terms" }),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch("password", "");

  const passwordStrength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return score;
  })();

  async function onSubmit(data: RegisterValues) {
    setLoading(true);
    setServerError("");
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { username: data.username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setServerError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-20 grid-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <CheckCircle2 className="w-16 h-16 text-vdx-green mx-auto mb-4 drop-shadow-[0_0_20px_rgba(36,229,150,0.5)]" />
          <h2 className="font-heading text-2xl font-800 gradient-text-warm mb-3">Check Your Email</h2>
          <p className="text-vdx-muted text-sm leading-relaxed mb-6">
            A confirmation link has been sent to your email. Click the link to activate your account and access the mining dashboard.
          </p>
          <Link href="/auth/sign-in" className="btn-primary px-8 py-3">
            Back to Sign In
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 grid-bg relative">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-vdx-green/8 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="mb-4">
            <svg viewBox="0 0 100 160" className="w-12 h-12 drop-shadow-[0_0_20px_rgba(36,229,150,0.5)] animate-float">
              <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
              <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
              <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
              <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
            </svg>
          </Link>
          <h1 className="font-heading text-3xl font-800 tracking-tight gradient-text-warm">Create Account</h1>
          <p className="text-vdx-muted text-sm mt-2">Join Verdex and start mining VDX</p>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[rgba(255,92,108,0.08)] border border-[rgba(255,92,108,0.2)] mb-6">
          <ShieldAlert className="w-4 h-4 text-vdx-error flex-shrink-0 mt-0.5" />
          <p className="text-xs text-vdx-muted leading-relaxed">
            <strong className="text-vdx-error">Verdex will never ask for your seed phrase or private key.</strong>{" "}
            Only create your account on <span className="font-mono text-vdx-green">verdexswap.site</span>
          </p>
        </div>

        <div className="glass-darker rounded-2xl p-7 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Username */}
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">Username</label>
              <input
                {...register("username")}
                type="text"
                autoComplete="username"
                placeholder="satoshi_vdx"
                className={cn("vdx-input", errors.username && "border-vdx-error/50")}
              />
              {errors.username && <p className="text-xs text-vdx-error mt-1">{errors.username.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">Email</label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={cn("vdx-input", errors.email && "border-vdx-error/50")}
              />
              {errors.email && <p className="text-xs text-vdx-error mt-1">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">Password</label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 chars, uppercase + number"
                  className={cn("vdx-input pr-10", errors.password && "border-vdx-error/50")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vdx-muted hover:text-vdx-text">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength bar */}
              {password && (
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300",
                      passwordStrength >= i
                        ? i <= 1 ? "bg-vdx-error" : i <= 2 ? "bg-vdx-warning" : "bg-vdx-green"
                        : "bg-white/10"
                    )} />
                  ))}
                </div>
              )}
              {errors.password && <p className="text-xs text-vdx-error mt-1">{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">Confirm Password</label>
              <input
                {...register("confirmPassword")}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat your password"
                className={cn("vdx-input", errors.confirmPassword && "border-vdx-error/50")}
              />
              {errors.confirmPassword && <p className="text-xs text-vdx-error mt-1">{errors.confirmPassword.message}</p>}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-3">
              <input
                {...register("terms")}
                type="checkbox"
                id="terms"
                className="w-4 h-4 mt-0.5 accent-vdx-green rounded cursor-pointer"
              />
              <label htmlFor="terms" className="text-xs text-vdx-muted leading-relaxed cursor-pointer">
                I accept the{" "}
                <Link href="/terms" className="text-vdx-green hover:text-vdx-bright">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" className="text-vdx-green hover:text-vdx-bright">Privacy Policy</Link>
                {" "}and understand that crypto involves substantial risk.
              </label>
            </div>
            {errors.terms && <p className="text-xs text-vdx-error -mt-2">{errors.terms.message}</p>}

            {/* Error */}
            {serverError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[rgba(255,92,108,0.1)] border border-[rgba(255,92,108,0.25)]">
                <AlertTriangle className="w-4 h-4 text-vdx-error flex-shrink-0 mt-0.5" />
                <p className="text-xs text-vdx-error">{serverError}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base justify-center mt-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</> : "Create Account"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[rgba(87,255,179,0.1)]" />
            <span className="text-xs text-vdx-muted">already registered?</span>
            <div className="flex-1 h-px bg-[rgba(87,255,179,0.1)]" />
          </div>

          <p className="text-center text-sm text-vdx-muted">
            <Link href="/auth/sign-in" className="text-vdx-green hover:text-vdx-bright font-semibold transition-colors">
              Sign in to existing account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
