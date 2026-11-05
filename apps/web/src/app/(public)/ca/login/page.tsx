import Link from "next/link";
import { AuthForm } from "../../../../components/AuthForm";
import { BrandMark } from "../../../../components/icons";

export const metadata = { title: "CA sign in" };

export default function CaLogin() {
  return (
    <div className="card auth-card">
      <BrandMark />
      <h1>CA sign in</h1>
      <p>For chartered accountants</p>
      <AuthForm mode="login" audience="ca" />
      <p className="auth-switch">
        <Link href="/ca/signup">New here? Create a CA account</Link>
      </p>
      <p className="auth-switch">
        <Link href="/login">Are you a freelancer? Sign in here</Link>
      </p>
    </div>
  );
}
