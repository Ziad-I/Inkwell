import type { Point } from "@/types/common";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useCollabIdentity } from "@/hooks/useCollabIdentity";
import {
  PresenceDot,
  type PresenceDotHandle,
} from "@/components/board/presence/presenceDot";

export interface LocalPresenceDotProps {
  radius?: number;
  visible?: boolean;
}

export const LocalPresenceDot = forwardRef<
  PresenceDotHandle,
  LocalPresenceDotProps
>(function LocalPresenceDot({ radius = 5, visible = true }, ref) {
  const { name: userName, color: userColor } = useCollabIdentity();

  const visualRef = useRef<PresenceDotHandle>(null);
  const latestPosRef = useRef<Point | null>(null);
  const pendingPosRef = useRef<Point | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasPosRef = useRef(false);
  const [hasPos, setHasPos] = useState(false);

  const flush = useCallback(() => {
    rafRef.current = null;

    const next = pendingPosRef.current;
    if (!next) return;

    visualRef.current?.setPos(next);

    if (!hasPosRef.current) {
      hasPosRef.current = true;
      setHasPos(true);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  useImperativeHandle(
    ref,
    () => ({
      setPos(p: Point) {
        latestPosRef.current = p;
        pendingPosRef.current = p;
        scheduleFlush();
      },
      getPos() {
        return latestPosRef.current;
      },
    }),
    [scheduleFlush],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <PresenceDot
      ref={visualRef}
      radius={radius}
      visible={visible && hasPos}
      userColor={userColor}
      userName={userName}
    />
  );
});

export default LocalPresenceDot;
