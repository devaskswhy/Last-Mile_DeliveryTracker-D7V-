import { ResetPasswordForm } from "../ResetPasswordForm";

export const metadata = {
  title: "Set a new password — Last-Mile",
  description: "Set a new password using the link that was emailed to you.",
};

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  return <ResetPasswordForm token={searchParams?.token ?? null} />;
}
