import type { ToolMetadata, Tools } from "@/tools/types";
import { create } from "zustand";

type ToolStore = {
  activeToolId: Tools | null;
  allTools: ToolMetadata[];

  setActiveTool: (toolId: Tools | null) => void;
  setAllTools: (tools: ToolMetadata[]) => void;
};

const initialState = {
  activeToolId: null,
  allTools: [],
};

export const useToolStore = create<ToolStore>()((set) => ({
  ...initialState,
  setActiveTool: (toolId: Tools | null) => set({ activeToolId: toolId }),
  setAllTools: (tools: ToolMetadata[]) => set({ allTools: tools }),
}));
