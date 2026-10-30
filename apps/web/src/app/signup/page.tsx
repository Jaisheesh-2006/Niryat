import { AuthForm } from "../../components/AuthForm";
import { PayPalLoginError } from "../../components/PayPalLoginError";

export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Create account</h1>
      <PayPalLoginError error={error} />
      <AuthForm mode="signup" />
      <p>
        <a href="/api/auth/paypal/start">Log in with PayPal</a>
      </p>
    </>
  );
}
