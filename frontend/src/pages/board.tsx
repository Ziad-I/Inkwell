import InfiniteCanvas from "@/components/board/canvas/canvas";
import Toolbar from "@/components/board/toolbar/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { useUserStore } from "@/stores/userStore";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type ValidationState = "pending" | "valid" | "invalid";

function BoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [validation, setValidation] = useState<ValidationState>("pending");

  const userId = useUserStore((s) => s.userId);
  const userName = useUserStore((s) => s.userName);
  const userColor = useUserStore((s) => s.userColor);
  const url = import.meta.env.VITE_BACKEND_WS_URL;

  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  useEffect(() => {
    if (!roomId) {
      navigate("/", { replace: true });
      return;
    }

    const ensureBoardExists = async () => {
      try {
        const response = await api.get(`/boards/${roomId}`);
        setValidation("valid");
      } catch (error) {
        console.error(error);
        setValidation("invalid");
        navigate("/", { replace: true });
      }
    };

    ensureBoardExists();
  }, [roomId, navigate]);

  if (validation !== "valid") {
    return null;
  }

  return (
    <BoardManagersProvider
      userId={userId}
      userName={userName}
      userColor={userColor}
      url={url}
      roomId={roomId!}
      stageOperations={stageOperations}
    >
      <div>
        <Toolbar />
        <InfiniteCanvas
          stageRef={stageRef}
          drawingLayerRef={drawingLayerRef}
          overlayLayerRef={overlayLayerRef}
          stageOperations={stageOperations}
        />
      </div>
    </BoardManagersProvider>
  );
}

export default BoardPage;
