import Link from "next/link";
import { AuthAside } from "../../../../components/AuthAside";
import { AuthForm } from "../../../../components/AuthForm";
import { BrandMark } from "../../../../components/icons";
import { JudgeEntry } from "../../../../components/JudgeEntry";
import { PageHeader } from "../../../../components/PageHeader";

export const metadata = { title: "CA sign in" };

export default function CaLogin() {
  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <BrandMark />
        <PageHeader title="CA sign in" description="For chartered accountants" />
        <AuthForm mode="login" audience="ca" />
        <JudgeEntry />
        <p className="auth-switch">
          <Link href="/ca/signup">New here? Create a CA account</Link>
        </p>
        <p className="auth-switch">
          <Link href="/login">Are you a freelancer? Sign in here</Link>
        </p>
      </div>
      <AuthAside audience="ca" />
    </div>
  );
}
