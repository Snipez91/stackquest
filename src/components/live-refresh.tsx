"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/components/realtime";

/** Re-renders the server page when one of these realtime events arrives (throttled). */
export function LiveRefresh({ events }: { events: string[] }) {
  const router = useRouter();
  const { on } = useRealtime();
  const last = useRef(0);
  const key = events.join(",");
  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      if (now - last.current < 2000) return;
      last.current = now;
      router.refresh();
    };
    const offs = key.split(",").map((e) => on(e, handler));
    return () => offs.forEach((off) => off());
  }, [key, on, router]);
  return null;
}
