import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/current";

export default async function Home() {
  redirect((await currentUser()) ? "/dashboard" : "/sign-in");
}
