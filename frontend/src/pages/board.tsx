import InfiniteCanvas from "@/components/board/canvas/canvas";
import Toolbar from "@/components/board/toolbar/toolbar";
import { useStageOperations } from "@/hooks/useStageOperations";
import { useUserStore } from "@/stores/userStore";
import { BoardManagersProvider } from "@/providers/managersProvider";

function BoardPage() {
  const userId = useUserStore((s) => s.userId);
  const userName = useUserStore((s) => s.userName);
  const userColor = useUserStore((s) => s.userColor);
  const url = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

  const { stageOperations, stageRef, drawingLayerRef, overlayLayerRef } =
    useStageOperations();

  return (
    <BoardManagersProvider
      userId={userId}
      userName={userName}
      userColor={userColor}
      url={url}
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
