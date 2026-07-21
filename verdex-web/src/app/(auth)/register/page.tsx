"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SecurityWarning } from "@/components/shared/security-warning";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

const registerSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters").max(24, "Max 24 characters").regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a number"),
    confirm: z.string(),
    terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

const verifySchema = z.object({
  code: z.string().min(4, "Enter the code from your email").max(12),
});

type RegisterValues = z.infer<typeof registerSchema>;
type VerifyValues = z.infer<typeof verifySchema>;

function passwordStrength(pw: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", tone: "bg-danger" };
  if (score === 2) return { score, label: "Fair", tone: "bg-amber" };
  if (score === 3) return { score, label: "Good", tone: "bg-cyan" };
  return { score, label: "Strong", tone: "bg-emerald" };
}

export default function RegisterPage() {
  const { signUp, verifyCode, resendCode } = useAuth();
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), mode: "onBlur" });
  const verifyForm = useForm<VerifyValues>({ resolver: zodResolver(verifySchema) });
  const pw = form.watch("password") ?? "";
  const strength = passwordStrength(pw);

  async function onRegister(values: RegisterValues) {
    try {
      await signUp(values.email, values.password);
      setEmail(values.email);
      setStep("verify");
      toast.success("Account created", { description: "Check your inbox for the verification code." });
    } catch (e) {
      toast.error("Registration failed", { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function onVerify(values: VerifyValues) {
    try {
      await verifyCode(email, values.code.trim());
      setStep("done");
    } catch (e) {
      verifyForm.setError("code", { message: e instanceof Error ? e.message : "Invalid code" });
    }
  }

  if (step === "verify") {
    return (
      <Card className="edge-glow p-7 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-emerald/30 bg-emerald/10">
          <MailCheck className="h-7 w-7 text-emerald-bright" />
        </span>
        <h1 className="mt-5 font-heading text-2xl font-bold text-ink">Verify your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a verification code to <span className="mono text-emerald-bright">{email}</span>.
          Enter it below to activate your account.
        </p>
        <form onSubmit={verifyForm.handleSubmit(onVerify)} className="mt-6 space-y-4" noValidate>
          <Input
            {...verifyForm.register("code")}
            placeholder="Enter code"
            autoComplete="one-time-code"
            inputMode="numeric"
            className="mono text-center text-lg tracking-[0.3em]"
            aria-label="Verification code"
          />
          {verifyForm.formState.errors.code && (
            <p className="text-xs text-danger">{verifyForm.formState.errors.code.message}</p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={verifyForm.formState.isSubmitting}>
            {verifyForm.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify & Continue
          </Button>
        </form>
        <button onClick={() => { resendCode(email); toast.success("Code resent"); }} className="mt-4 text-sm text-emerald-bright hover:underline">
          Resend code
        </button>
        <p className="mt-3 text-xs text-faint">
          You can also verify via the link in the email, then{" "}
          <Link href="/sign-in" className="text-emerald-bright hover:underline">sign in</Link>.
        </p>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <Card className="edge-glow p-7 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-emerald/30 bg-emerald/10 animate-block-pop">
          <CheckCircle2 className="h-7 w-7 text-emerald-bright" />
        </span>
        <h1 className="mt-5 font-heading text-2xl font-bold text-ink">You&apos;re verified</h1>
        <p className="mt-2 text-sm text-muted">Your Verdex account is ready. Sign in to open your dashboard.</p>
        <Link href="/sign-in" className="mt-6 block">
          <Button className="w-full" size="lg">Continue to Sign In</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="edge-glow p-7 sm:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">One account for mining, wallet, rewards and referrals.</p>

      <form onSubmit={form.handleSubmit(onRegister)} className="mt-6 space-y-4" noValidate>
        <div>
          <Label htmlFor="username" className="mb-1.5 block">Username</Label>
          <Input id="username" placeholder="verdex_miner" autoComplete="username" {...form.register("username")} aria-invalid={!!form.formState.errors.username} />
          {form.formState.errors.username && <p className="mt-1.5 text-xs text-danger">{form.formState.errors.username.message}</p>}
        </div>

        <div>
          <Label htmlFor="email" className="mb-1.5 block">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
          {form.formState.errors.email && <p className="mt-1.5 text-xs text-danger">{form.formState.errors.email.message}</p>}
        </div>

        <div>
          <Label htmlFor="password" className="mb-1.5 block">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Min. 10 characters"
              {...form.register("password")}
              aria-invalid={!!form.formState.errors.password}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pw && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < strength.score ? strength.tone : "bg-white/10")} />
                ))}
              </div>
              <span className="text-[11px] text-muted">{strength.label}</span>
            </div>
          )}
          {form.formState.errors.password && <p className="mt-1.5 text-xs text-danger">{form.formState.errors.password.message}</p>}
        </div>

        <div>
          <Label htmlFor="confirm" className="mb-1.5 block">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" placeholder="Repeat password" {...form.register("confirm")} aria-invalid={!!form.formState.errors.confirm} />
          {form.formState.errors.confirm && <p className="mt-1.5 text-xs text-danger">{form.formState.errors.confirm.message}</p>}
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
            <input type="checkbox" {...form.register("terms")} className="mt-0.5 h-4 w-4 rounded border-line bg-black/40 accent-emerald" />
            <span>
              I accept the <Link href="/docs" className="text-emerald-bright hover:underline">Terms of Use</Link> and{" "}
              <Link href="/security#risk" className="text-emerald-bright hover:underline">Risk Disclosure</Link>.
            </span>
          </label>
          {form.formState.errors.terms && <p className="mt-1.5 text-xs text-danger">{form.formState.errors.terms.message}</p>}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Create Account
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-emerald-bright hover:underline">Sign in</Link>
      </p>

      <SecurityWarning className="mt-6" compact />
    </Card>
  );
}
