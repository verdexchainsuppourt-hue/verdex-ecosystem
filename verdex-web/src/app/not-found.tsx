import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VerdexMark } from "@/components/shared/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-abyss px-4">
      <div className="text-center">
        <VerdexMark className="mx-auto h-16 w-10 opacity-70" />
        <h1 className="mt-6 font-heading text-5xl font-bold text-ink">404</h1>
        <p className="mt-3 text-muted">This page doesn&apos;t exist on Verdex Mainnet.</p>
        <Link href="/" className="mt-8 inline-block">
          <Button>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}
