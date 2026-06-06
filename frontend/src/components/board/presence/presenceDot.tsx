import type { Point } from "@/types/common";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Circle, Group, Label, Tag, Text } from "react-konva";
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

    return (
      <Group ref={nodeRef} x={0} y={0} visible={visible} listening={false}>
        <Label x={0} y={-radius - 22} listening={false}>
          <Tag
            fill={userColor}
            cornerRadius={4}
            opacity={0.9}
            shadowColor="#000000"
            shadowBlur={4}
            shadowOpacity={0.25}
          />
          <Text
            text={userName}
            fontSize={11}
            fontFamily="Inter, sans-serif"
            fill="#ffffff"
            padding={4}
            listening={false}
          />
        </Label>

        <Circle
          x={0}
          y={0}
          radius={radius + 2}
          fill={userColor}
          opacity={0.3}
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
