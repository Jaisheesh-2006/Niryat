"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      className="auth-form"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setSubmitting(true);
        setMessage("");
        const result = await sendJson(`/api/auth/${mode}`, "POST", {
          email: form.get("email"),
          password: form.get("password"),
        });
        setSubmitting(false);
        if (result.ok) router.push("/overview");
        else setMessage(result.message);
      }}
    >
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        minLength={12}
        maxLength={128}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
      />
      <button type="submit" className="btn" data-variant="primary" disabled={submitting}>
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      {message && (
        <p role="alert" className="banner" data-tone="danger">
          {message}
        </p>
      )}
    </form>
  );
}
