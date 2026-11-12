"use client";

import type { UserRole } from "@niryat/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sendJson } from "../lib/forms";

export function AuthForm({
  mode,
  audience = "freelancer",
}: {
  mode: "login" | "signup";
  audience?: UserRole;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginPath, setLoginPath] = useState<"/ca/login" | "/login" | undefined>();
  useEffect(() => setReady(true), []);

  return (
    <form
      className="auth-form"
      method="post"
      aria-describedby={message ? "auth-error" : undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setSubmitting(true);
        setMessage("");
        setLoginPath(undefined);
        const result = await sendJson(
          `/api/auth/${audience === "ca" ? "ca/" : ""}${mode}`,
          "POST",
          {
            email: form.get("email"),
            password: form.get("password"),
          },
        );
        // A fresh request must see the new session, not a cached logged-out redirect.
        if (result.ok) window.location.replace(audience === "ca" ? "/ca" : "/overview");
        else {
          setSubmitting(false);
          setLoginPath(result.loginPath);
          setMessage(result.message);
        }
      }}
    >
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        aria-describedby={message ? "auth-error" : undefined}
        required
      />
      <label htmlFor="password">Password</label>
      <div className="password-field">
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          minLength={12}
          maxLength={128}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={message ? "auth-error" : undefined}
          required
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls="password"
          aria-pressed={showPassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((shown) => !shown)}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            {showPassword && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
      <button type="submit" className="btn" data-variant="primary" disabled={!ready || submitting}>
        {mode === "login" ? "Sign in" : "Create account"}
      </button>
      {message && (
        <p id="auth-error" role="alert" className="banner" data-tone="danger">
          {message}
          {loginPath && (
            <>
              {" "}
              <Link href={loginPath}>
                Open {loginPath === "/ca/login" ? "CA" : "freelancer"} sign-in
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
