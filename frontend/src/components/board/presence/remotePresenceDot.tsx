export interface RemotePresenceDotProps {
  radius?: number;
  visible?: boolean;
}

// interface RemotePresenceDotItemProps {
//   userId: string;
//   radius: number;
//   visible: boolean;
//   userColor: string;
//   userName: string;
//   onRegister: (userId: string, handle: PresenceDotHandle | null) => void;
// }

// function RemotePresenceDotItem({
//   userId,
//   radius,
//   visible,
//   userColor,
//   userName,
//   onRegister,
// }: RemotePresenceDotItemProps) {
//   const visualRef = useRef<PresenceDotHandle>(null);

//   useEffect(() => {
//     onRegister(userId, visualRef.current);

//     return () => {
//       onRegister(userId, null);
//     };
//   }, [onRegister, userId]);

//   return (
//     <PresenceDot
//       ref={visualRef}
//       radius={radius}
//       visible={visible}
//       userColor={userColor}
//       userName={userName}
//     />
//   );
// }

/**
 * TODO: remote presence display is to be rewired later.
 * Remote presence dots are not rendered in this interim state (Task 7).
 *
 * Transport access was removed from the board managers context, so
 * presentation components can no longer subscribe to raw socket events.
 * Remote presence events are consumed through the session coordinator's
 * presence wiring as part of the  UI rewiring; until then this
 * component intentionally renders nothing.
 */

export function RemotePresenceDot(_props: RemotePresenceDotProps) {
  return null;
}

export default RemotePresenceDot;
