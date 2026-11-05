import Link from "next/link";
import { AuthForm } from "../../../components/AuthForm";
import { BrandMark } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { PayPalLoginError } from "../../../components/PayPalLoginError";

export const metadata = { title: "Sign in" };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <div className="card auth-card">
      <BrandMark />
      <PageHeader title="Sign in" description="For freelancers" />
      <PayPalLoginError error={error} />
      <AuthForm mode="login" />
      <div className="auth-divider">or</div>
      <a href="/api/auth/paypal/start" className="btn" data-variant="secondary">
        Log in with PayPal
      </a>
      <p className="auth-switch">
        <Link href="/signup">New here? Create an account</Link>
      </p>
      <p className="auth-switch">
        <Link href="/ca/login">Are you a CA? Sign in here</Link>
      </p>
    </div>
  );
}
