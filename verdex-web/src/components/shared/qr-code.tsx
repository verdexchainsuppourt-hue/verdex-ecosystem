"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Client-rendered QR code (deposit addresses, referral links). */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QR) =>
      QR.toDataURL(value, {
        width: size,
        margin: 1,
        color: { dark: "#57FFB3", light: "#06100D" },
      }).then((url) => {
        if (!cancelled) setSrc(url);
      })
    ).catch(() => {});
    return () => { cancelled = true; };
  }, [value, size]);

  if (!src) return <Skeleton style={{ width: size, height: size }} className="rounded-xl" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`QR code for ${value}`} className="rounded-xl" />;
}
