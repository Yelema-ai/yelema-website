import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function NotFound() {
  const { user } = await getSession();
  redirect(user ? "/accueil" : "/login");
}
