import BoardSession from "@/components/session/boardSession";
import { useStageOperations } from "@/hooks/useStageOperations";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useParams, useNavigate } from "react-router";
import { useEffect } from "react";

function BoardPage() {
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  const { roomId } = useParams<{ roomId: string }>();

  const navigate = useNavigate();

  const url = import.meta.env.VITE_BACKEND_WS_URL;

  useEffect(() => {
    if (!roomId) {
      navigate("/", { replace: true });
    }
  }, [roomId, navigate]);

  return (
    <BoardManagersProvider
      url={url}
      roomId={roomId!}
      stageOperations={stageOperations}
    >
      <BoardSession
        stageRef={stageRef}
        drawingLayerRef={drawingLayerRef}
        overlayLayerRef={overlayLayerRef}
        stageOperations={stageOperations}
      />
    </BoardManagersProvider>
  );
}

export default BoardPage;
