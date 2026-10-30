import { AuthForm } from "../../components/AuthForm";
import { PayPalLoginError } from "../../components/PayPalLoginError";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <PayPalLoginError error={error} />
      <AuthForm mode="login" />
      <p>
        <a href="/api/auth/paypal/start">Log in with PayPal</a>
      </p>
    </>
  );
}
