import { create } from "zustand";

export interface Command {
  do: () => void;
  undo: () => void;
}

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  canUndo: boolean;
  canRedo: boolean;
  push: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  push: (cmd) => {
    cmd.do();
    set((s) => {
      const newUndoStack = [...s.undoStack, cmd];
      return {
        undoStack: newUndoStack,
        redoStack: [],
        canUndo: newUndoStack.length > 0,
        canRedo: false,
      };
    });
  },
  undo: () => {
    const { undoStack } = get();
    const cmd = undoStack[undoStack.length - 1];
    if (!cmd) return;
    cmd.undo();
    set((s) => {
      const newUndoStack = s.undoStack.slice(0, -1);
      const newRedoStack = [...s.redoStack, cmd];
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: newRedoStack.length > 0,
      };
    });
  },
  redo: () => {
    const { redoStack } = get();
    const cmd = redoStack[redoStack.length - 1];
    if (!cmd) return;
    cmd.do();
    set((s) => {
      const newRedoStack = s.redoStack.slice(0, -1);
      const newUndoStack = [...s.undoStack, cmd];
      return {
        redoStack: newRedoStack,
        undoStack: newUndoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: newRedoStack.length > 0,
      };
    });
  },
}));
