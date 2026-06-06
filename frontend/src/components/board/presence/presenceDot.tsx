import type { Point } from "@/types/common";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Circle, Group, Rect, Text } from "react-konva";
import type Konva from "konva";

export type PresenceDotHandle = {
  setPos: (p: Point) => void;
  getPos: () => Point | null;
};

export interface PresenceDotProps {
  radius: number;
  visible: boolean;
  userColor: string;
  userName: string;
}

export const PresenceDot = forwardRef<PresenceDotHandle, PresenceDotProps>(
  function PresenceDot({ radius, visible, userColor, userName }, ref) {
    const nodeRef = useRef<Konva.Group | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        setPos(p: Point) {
          const node = nodeRef.current;
          if (!node) return;
          node.position(p);
        },
        getPos() {
          const node = nodeRef.current;
          if (!node) return null;
          return node.position() as Point;
        },
      }),
      [],
    );

    const badgeWidth = useMemo(() => {
      const estimated = userName.length * 7 + 32;
      return Math.max(32, Math.min(160, estimated));
    }, [userName]);

    const badgeHeight = 22;
    const badgeY = -radius - badgeHeight - 3;

    return (
      <Group ref={nodeRef} x={0} y={0} visible={visible} listening={false}>
        <Group x={0} y={badgeY} listening={false}>
          <Rect
            width={badgeWidth}
            height={badgeHeight}
            cornerRadius={8}
            fill="#111827"
            opacity={0.96}
            stroke={userColor}
            strokeWidth={1}
          />
          <Circle x={11} y={11} radius={5} fill={userColor} />
          <Text
            x={21}
            y={7}
            width={badgeWidth - 24}
            height={16}
            text={userName}
            fontSize={11}
            fontFamily="Inter, sans-serif"
            fontStyle="600"
            fill="#F9FAFB"
            ellipsis
          />
        </Group>

        <Circle
          x={0}
          y={0}
          radius={radius + 2}
          fill={userColor}
          opacity={0.22}
          listening={false}
        />

        <Circle
          x={0}
          y={0}
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
        />
      </Group>
    );
  },
);
