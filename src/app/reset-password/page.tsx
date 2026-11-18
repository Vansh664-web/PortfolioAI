import AuthFlow from "@/app/(auth)/auth-flow";
import "@/app/(auth)/auth.css";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <AuthFlow mode="reset" initialToken={token}/>;
}
