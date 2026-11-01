"use client";

import { catchError, type ErrorInfo } from "next/error";

export function CardFallback(
  { title, quiet }: { title: string; quiet?: boolean },
  { retry }: ErrorInfo,
) {
  if (quiet) return null;
  return (
    <div className="card">
      <h2>{title}</h2>
      <p>Couldn't load this card. Nothing was sent to PayPal.</p>
      <button type="button" className="btn" data-variant="ghost" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

export const CardBoundary = catchError(CardFallback);
