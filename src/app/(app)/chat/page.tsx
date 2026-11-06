import { requireContext } from "@/server/auth/current";
import { ChatPanel } from "@/components/chat/chat-panel";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ mission?: string; c?: string }> }) {
  const sp = await searchParams;
  const { user, role } = await requireContext();
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-8rem)] sm:-mx-6 md:h-[calc(100dvh-4rem)] lg:-my-8">
      <h1 className="sr-only">Team chat</h1>
      <div className="card h-full overflow-hidden md:mx-6 md:mt-6">
        <ChatPanel me={{ id: user.id, handle: user.handle, role, displayName: user.displayName, avatarHue: user.avatarHue }} missionSlug={sp.mission && /^[a-z0-9-]{1,80}$/.test(sp.mission) ? sp.mission : undefined} initialChannelId={sp.c} />
      </div>
    </div>
  );
}
