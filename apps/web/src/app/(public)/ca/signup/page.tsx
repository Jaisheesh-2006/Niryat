import Link from "next/link";
import { AuthForm } from "../../../../components/AuthForm";
import { BrandMark } from "../../../../components/icons";
import { PageHeader } from "../../../../components/PageHeader";

export const metadata = { title: "Create CA account" };

export default function CaSignup() {
  return (
    <div className="card auth-card">
      <BrandMark />
      <PageHeader title="Create CA account" description="For chartered accountants" />
      <AuthForm mode="signup" audience="ca" />
      <p className="auth-switch">
        <Link href="/ca/login">Already registered? Sign in</Link>
      </p>
      <p className="auth-switch">
        <Link href="/login">Are you a freelancer? Sign in here</Link>
      </p>
    </div>
  );
}
