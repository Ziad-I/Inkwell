import type { Point } from "@/types/common";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { Circle } from "react-konva";

export type PresenceDotHandle = {
  setPos: (p: Point) => void;
  getPos: () => Point | null;
};

interface PresenceDotProps {
  color?: string;
  radius?: number;
  visible?: boolean;
}

const PresenceDot = forwardRef<PresenceDotHandle, PresenceDotProps>(
  function PresenceDot({ radius = 5, color = "#3b82f6", visible = true }, ref) {
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
          fill={color}
          opacity={0.3}
          listening={false}
          visible={visible}
        />
        <Circle
          x={pos?.x}
          y={pos?.y}
          radius={radius}
          fill={color}
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
