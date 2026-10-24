# 1. Sign in with PayPal and compliance health check

Status: planned; scaffold only. Source: [PLAN section 5](../PLAN.md#5-v1-features-in-order-of-importance).

## Goal

Connect PayPal identity and capture the compliance profile with sourced health flags.

## User story

As an Indian freelancer paid through PayPal, I want to connect my PayPal account and understand profile gaps so I can prepare reliable records for my CA.

## Acceptance criteria

- [ ] User signs in with PayPal (sandbox) and the PayPal business account is connected
- [ ] Profile saves GST status, GSTIN, LUT details, work type, purpose code
- [ ] Health score (0–100) with at least: LUT status, purpose-code fit, GST threshold proximity
- [ ] Each red flag shows the rule it comes from and a "verify with your CA" note

## Data & APIs used

users, profiles; Log in with PayPal; profile zod schemas; rules health evaluation.

## Edge cases

Unregistered users; expired LUT; incomplete profile; refused OAuth consent; disconnected sandbox account.

## Test cases (TODO)

- TODO: Add acceptance tests for each criterion, including the edge cases above.
- TODO: Add boundary, retry/idempotency and authorization tests where applicable.

## Out of scope

Other v1 specs, stretch features, direct tax-portal filing, goods exports, other payment providers and production PayPal access.
