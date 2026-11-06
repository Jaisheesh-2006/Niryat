"use client";

import { judgeModeSchema, type UserRole } from "@niryat/shared";
import { useEffect, useState } from "react";
import { sendJson } from "../lib/forms";

export function JudgeEntry() {
  const [enabled, setEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/judge-mode", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = judgeModeSchema.safeParse(await response.json());
        if (active && parsed.success) setEnabled(parsed.data.enabled);
      })
      .catch(() => {
        console.error("Demo availability check failed");
      });
    return () => {
      active = false;
    };
  }, []);
  if (!enabled) return null;
  async function enter(as: UserRole) {
    setSubmitting(true);
    setMessage("");
    const result = await sendJson("/api/auth/judge", "POST", { as });
    if (result.ok) window.location.replace(as === "ca" ? "/ca" : "/overview");
    else {
      setSubmitting(false);
      setMessage(result.message);
    }
  }
  return (
    <div>
      <p>Demo accounts use PayPal sandbox only. No real money moves.</p>
      <p>Shared demo accounts contain synthetic records. Do not enter personal information.</p>
      <div className="hero-actions">
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          disabled={submitting}
          onClick={() => enter("freelancer")}
        >
          Try as freelancer (demo)
        </button>
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          disabled={submitting}
          onClick={() => enter("ca")}
        >
          Try as CA (demo)
        </button>
      </div>
      {message && (
        <p role="alert" className="banner" data-tone="danger">
          {message}
        </p>
      )}
    </div>
  );
}
