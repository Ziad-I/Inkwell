import InfiniteCanvas from "@/components/board/canvas/canvas";
import Toolbar from "@/components/board/toolbar/toolbar";
import ToolSettings from "@/components/board/toolbar/toolSettings";
import { useStageOperations } from "@/hooks/useStageOperations";
import { useUserStore } from "@/stores/userStore";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { BoardManagersProvider } from "@/providers/managersProvider";
import { useParams, useNavigate, useLocation } from "react-router";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type ValidationState = "pending" | "valid" | "invalid";

function BoardPage() {
  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  const { roomId } = useParams<{ roomId: string }>();

  const navigate = useNavigate();
  const location = useLocation();
  const skipValidation = location.state?.skipValidation || false;

  const userId = useUserStore((s) => s.userId);
  const userName = useUserStore((s) => s.userName);
  const userColor = useUserStore((s) => s.userColor);
  const url = import.meta.env.VITE_BACKEND_WS_URL;

  const [validation, setValidation] = useState<ValidationState>(
    skipValidation ? "valid" : "pending",
  );

  useEffect(() => {
    if (!roomId) {
      navigate("/", { replace: true });
      return;
    }

    if (validation === "valid") return;

    const ensureBoardExists = async () => {
      try {
        await api.get(`/boards/${roomId}`);
        setValidation("valid");
      } catch {
        setValidation("invalid");
        navigate("/", { replace: true });
      }
    };

    ensureBoardExists();
  }, [roomId, navigate]);

  if (validation !== "valid") {
    return <LoadingSpinner />;
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
        <ToolSettings />
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
