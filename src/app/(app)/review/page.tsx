import { requireContext } from "@/server/auth/current";
import { PageHeader } from "@/components/ui";
import { ReviewSession } from "@/components/review/review-session";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  await requireContext();
  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Short retrieval practice, mixed across tracks. Answer from memory before you see any explanation — effortful recall is what builds lasting skill."
      />
      <ReviewSession />
    </div>
  );
}
