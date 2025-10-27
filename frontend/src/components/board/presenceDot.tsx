import type { Point } from "@/types/common";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { Circle } from "react-konva";
import { useUserStore } from "@/stores/userStore";

export type PresenceDotHandle = {
  setPos: (p: Point) => void;
  getPos: () => Point | null;
};

interface PresenceDotProps {
  radius?: number;
  visible?: boolean;
}

const PresenceDot = forwardRef<PresenceDotHandle, PresenceDotProps>(
  function PresenceDot({ radius = 5, visible = true }, ref) {
    const userColor = useUserStore((state) => state.userColor);
    const [pos, setPosState] = useState<Point | null>({ x: 0, y: 0 });

    const latestPosRef = useRef<Point | null>(pos);
    useEffect(() => {
      latestPosRef.current = pos;
    }, [pos]);

    useImperativeHandle(
      ref,
      () => ({
        setPos(p: Point) {
          latestPosRef.current = p;
          setPosState(p);
        },
        getPos() {
          return latestPosRef.current;
        },
      }),
      []
    );

    return (
      <>
        <Circle
          x={pos?.x}
          y={pos?.y}
          radius={radius + 2}
          fill={userColor}
          opacity={0.3}
          listening={false}
          visible={visible}
        />
        <Circle
          x={pos?.x}
          y={pos?.y}
          radius={radius}
          fill={userColor}
          stroke="#ffffff"
          strokeWidth={2}
          shadowColor="#000000"
          shadowOpacity={0.2}
          shadowOffsetX={1}
          shadowOffsetY={1}
          shadowBlur={2}
          listening={false}
          visible={visible}
        />
      </>
    );
  }
);

export default PresenceDot;
