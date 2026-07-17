import { createFileRoute } from "@tanstack/react-router";
import { SignUp } from "@/features/auth/components/sign-up";

export const Route = createFileRoute("/_public/sign-up")({ component: SignUp });
