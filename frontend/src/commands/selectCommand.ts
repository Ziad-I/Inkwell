import { BaseCommand } from "@/commands/baseCommand";
import type { StageOperations } from "@/types/common";
import type Konva from "konva";

interface NodeState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export class SelectCommand extends BaseCommand {
  private stageOps: StageOperations;
  private nodes: Konva.Node[];
  private initialState: Map<string, NodeState> = new Map();
  private finalState: Map<string, NodeState> = new Map();

  constructor(stageOps: StageOperations, nodes: Konva.Node[]) {
    super();
    this.stageOps = stageOps;
    this.nodes = nodes;

    // this.setInitialState(nodes);
  }

  private nodeToState(node: Konva.Node): NodeState {
    return {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
      skewX: node.skewX(),
      skewY: node.skewY(),
      offsetX: node.offsetX(),
      offsetY: node.offsetY(),
      width: node.width(),
      height: node.height(),
    };
  }

  execute() {
    for (const node of this.nodes) {
      const state = this.finalState.get(node.id());
      if (state) {
        node.position({ x: state.x, y: state.y });
        node.scale({ x: state.scaleX, y: state.scaleY });
        node.rotation(state.rotation);
        node.skewX(state.skewX);
        node.skewY(state.skewY);
        node.offsetX(state.offsetX);
        node.offsetY(state.offsetY);
        node.width(state.width);
        node.height(state.height);
      }
    }

    this.stageOps.redrawDrawingLayer();
  }

  undo() {
    for (const node of this.nodes) {
      const state = this.initialState.get(node.id());
      if (state) {
        node.position({ x: state.x, y: state.y });
        node.scale({ x: state.scaleX, y: state.scaleY });
        node.skew({ x: state.skewX, y: state.skewY });
        node.offset({ x: state.offsetX, y: state.offsetY });
        node.rotation(state.rotation);
        node.width(state.width);
        node.height(state.height);
      }
    }

    this.stageOps.redrawDrawingLayer();
  }

  destroy(): void {
    this.nodes = [];
    this.initialState.clear();
    this.finalState.clear();
  }

  canCommit(): boolean {
    return (
      this.nodes.length > 0 &&
      this.finalState.size > 0 &&
      this.initialState.size === this.finalState.size
    );
  }

  setInitialState(nodes: Konva.Node[]): void {
    this.initialState.clear();
    for (const node of nodes) {
      this.initialState.set(node.id(), this.nodeToState(node));
    }
  }

  setFinalState(nodes: Konva.Node[]): void {
    this.finalState.clear();
    for (const node of nodes) {
      this.finalState.set(node.id(), this.nodeToState(node));
    }
  }
}
