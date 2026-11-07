import Link from "next/link";
import { AuthAside } from "../../../components/AuthAside";
import { AuthForm } from "../../../components/AuthForm";
import { BrandMark } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { PayPalLoginError } from "../../../components/PayPalLoginError";

export const metadata = { title: "Create account" };

export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <BrandMark />
        <PageHeader title="Create account" description="For freelancers" />
        <PayPalLoginError error={error} />
        <AuthForm mode="signup" />
        <div className="auth-divider">or</div>
        <a href="/api/auth/paypal/start" className="btn" data-variant="secondary">
          Log in with PayPal
        </a>
        <p className="auth-switch">
          <Link href="/login">Already registered? Sign in</Link>
        </p>
        <p className="auth-switch">
          <Link href="/ca/login">Are you a CA? Sign in here</Link>
        </p>
      </div>
      <AuthAside />
    </div>
  );
}
