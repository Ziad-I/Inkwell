import { useAuthStore } from "@/stores/authStore";
import { usePresenceStore } from "@/stores/presenceStore";

export function useCollabIdentity() {
  const user = useAuthStore((s) => s.user);

  const anonymousId = usePresenceStore((s) => s.anonymousId);
  const anonymousName = usePresenceStore((s) => s.anonymousName);
  const userColor = usePresenceStore((s) => s.presenceColor);

  return {
    id: user?.id ?? anonymousId,
    name: user?.username ?? anonymousName,
    color: userColor,
  };
}
