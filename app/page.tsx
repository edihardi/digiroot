import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function Home() {
  const authed = await isAuthenticated();
  redirect(authed ? "/dashboard" : "/login");
}
