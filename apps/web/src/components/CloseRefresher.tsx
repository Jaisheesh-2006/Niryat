"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function CloseRefresher() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
