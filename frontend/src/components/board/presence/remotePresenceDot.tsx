import type { Point } from "@/types/common";
import { useBoardManagers } from "@/context/boardManagersContext";
import type { PresenceMeta } from "@/types/command";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PresenceDot,
  type PresenceDotHandle,
} from "@/components/board/presence/presenceDot";

export interface RemotePresenceDotProps {
  radius?: number;
  visible?: boolean;
}

interface RemotePresenceDotItemProps {
  userId: string;
  radius: number;
  visible: boolean;
  userColor: string;
  userName: string;
  onRegister: (userId: string, handle: PresenceDotHandle | null) => void;
}

function RemotePresenceDotItem({
  userId,
  radius,
  visible,
  userColor,
  userName,
  onRegister,
}: RemotePresenceDotItemProps) {
  const visualRef = useRef<PresenceDotHandle>(null);

  useEffect(() => {
    onRegister(userId, visualRef.current);

    return () => {
      onRegister(userId, null);
    };
  }, [onRegister, userId]);

  return (
    <PresenceDot
      ref={visualRef}
      radius={radius}
      visible={visible}
      userColor={userColor}
      userName={userName}
    />
  );
}

export function RemotePresenceDot({
  radius = 5,
  visible = true,
}: RemotePresenceDotProps) {
  const { connectionManagerRef, sessionStatus } = useBoardManagers();
  const ready = sessionStatus.status === "ready";

  const [usersById, setUsersById] = useState<Map<string, PresenceMeta>>(
    () => new Map(),
  );

  const latestPosRef = useRef(new Map<string, Point>());
  const handlesByIdRef = useRef(new Map<string, PresenceDotHandle>());
  const dirtyIdsRef = useRef(new Set<string>());
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;

    dirtyIdsRef.current.forEach((userId) => {
      const handle = handlesByIdRef.current.get(userId);
      const pos = latestPosRef.current.get(userId);

      if (!handle || !pos) return;
      handle.setPos(pos);
    });

    dirtyIdsRef.current.clear();
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const handlePresenceJoin = useCallback(
    (userId: string, meta: PresenceMeta) => {
      setUsersById((prev) => {
        const existing = prev.get(userId);

        if (
          existing &&
          existing.userColor === meta.userColor &&
          existing.userName === meta.userName
        ) {
          return prev;
        }

        const next = new Map(prev);
        next.set(userId, meta);
        return next;
      });
    },
    [],
  );

  const handlePresenceMove = useCallback(
    (userId: string, pos: Point) => {
      latestPosRef.current.set(userId, pos);
      dirtyIdsRef.current.add(userId);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const handlePresenceLeave = useCallback((userId: string) => {
    latestPosRef.current.delete(userId);
    dirtyIdsRef.current.delete(userId);
    handlesByIdRef.current.delete(userId);

    setUsersById((prev) => {
      if (!prev.has(userId)) return prev;

      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const registerHandle = useCallback(
    (userId: string, handle: PresenceDotHandle | null) => {
      if (handle) {
        handlesByIdRef.current.set(userId, handle);

        const pos = latestPosRef.current.get(userId);
        if (pos) {
          handle.setPos(pos);
        }

        return;
      }

      handlesByIdRef.current.delete(userId);
    },
    [],
  );

  useEffect(() => {
    if (!ready) return;

    const conn = connectionManagerRef.current;
    if (!conn) return;

    conn.on("presence:join", handlePresenceJoin);
    conn.on("presence:move", handlePresenceMove);
    conn.on("presence:leave", handlePresenceLeave);

    return () => {
      conn.off("presence:join", handlePresenceJoin);
      conn.off("presence:move", handlePresenceMove);
      conn.off("presence:leave", handlePresenceLeave);
    };
  }, [
    connectionManagerRef,
    ready,
    handlePresenceJoin,
    handlePresenceMove,
    handlePresenceLeave,
  ]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <>
      {Array.from(usersById.entries()).map(([userId, meta]) => (
        <RemotePresenceDotItem
          key={userId}
          userId={userId}
          radius={radius}
          visible={visible}
          userColor={meta.userColor}
          userName={meta.userName}
          onRegister={registerHandle}
        />
      ))}
    </>
  );
}

export default RemotePresenceDot;
