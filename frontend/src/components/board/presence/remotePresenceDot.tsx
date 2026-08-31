import { useRemotePresenceStore } from "@/stores/remotePresenceStore";
import { PresenceDot } from "@/components/board/presence/presenceDot";

export interface RemotePresenceDotProps {
  radius?: number;
}

/**
 * Renders one presence dot per remote user known to the session's
 * presence model. The store is fed by the board session coordinator's
 * validated presence listeners, so this component never touches the
 * transport directly. A user is rendered once they have a position.
 */
export function RemotePresenceDot({ radius = 5 }: RemotePresenceDotProps) {
  const remoteUsers = useRemotePresenceStore((state) => state.remoteUsers);

  return (
    <>
      {Array.from(remoteUsers.entries()).map(([userId, user]) => (
        <PresenceDot
          key={userId}
          radius={radius}
          visible={user.pos !== null}
          userColor={user.userColor}
          userName={user.userName}
          pos={user.pos}
        />
      ))}
    </>
  );
}

export default RemotePresenceDot;
