import { AuthForm } from "../AuthForm";

export const metadata = {
  title: "Create an account — Last-Mile",
  description:
    "Create a customer account to quote, place and track deliveries.",
};

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
