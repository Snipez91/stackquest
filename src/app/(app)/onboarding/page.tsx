import { DIAGNOSTIC } from "@/content/diagnostic";
import { requireContext } from "@/server/auth/current";
import { Diagnostic } from "./diagnostic";

export const metadata = { title: "Find your starting point" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ joined?: string }> }) {
  await requireContext();
  const sp = await searchParams;
  // Answers stay on the server; only prompts and options are sent.
  const questions = DIAGNOSTIC.map(({ answer: _a, ...q }) => q);
  return <Diagnostic questions={questions} joined={!!sp.joined} />;
}
