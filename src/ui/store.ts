import { cloneCharacter, saveCurrent } from '../core/storage';
import type { CharacterState } from '../core/mode';
import type { ParamValue } from '../core/schema';

/** 'live' = a slider is still moving (only redraw), 'full' = controls must resync too, 'history' = undo/redo state changed. */
export type ChangeKind = 'live' | 'full' | 'history';

const MAX_HISTORY = 100;

export class Store {
  character: CharacterState;
  /** Name of the gallery entry this character came from (used for the export file name). */
  name = '';
  private undoStack: CharacterState[] = [];
  private redoStack: CharacterState[] = [];
  private pending: CharacterState | null = null;
  private listeners: Array<(kind: ChangeKind) => void> = [];
  private saveTimer: number | undefined;

  constructor(initial: CharacterState) {
    this.character = initial;
  }

  subscribe(fn: (kind: ChangeKind) => void): void {
    this.listeners.push(fn);
  }

  private emit(kind: ChangeKind): void {
    this.listeners.forEach((fn) => fn(kind));
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => saveCurrent(this.character), 250);
  }

  private pushUndo(state: CharacterState): void {
    this.undoStack.push(state);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Change one parameter. `live` = part of a continuous drag; call `commit()` when it ends. */
  set(key: string, value: ParamValue, live = false): void {
    const cur = this.character;
    if (cur.params[key] === value) return;
    if (live) {
      if (!this.pending) this.pending = cloneCharacter(cur);
    } else {
      this.commit();
      this.pushUndo(cloneCharacter(cur));
    }
    this.character = { ...cur, params: { ...cur.params, [key]: value } };
    this.emit(live ? 'live' : 'full');
  }

  /** Ends a drag: the state from before the drag becomes one undo step. */
  commit(): void {
    if (!this.pending) return;
    this.pushUndo(this.pending);
    this.pending = null;
    this.emit('history');
  }

  /** Replace the whole character (randomize, reset, load, mode switch) as one undo step. */
  replace(next: CharacterState, name = ''): void {
    this.commit();
    this.pushUndo(cloneCharacter(this.character));
    this.character = next;
    this.name = name;
    this.emit('full');
  }

  undo(): void {
    this.commit();
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(cloneCharacter(this.character));
    this.character = prev;
    this.emit('full');
  }

  redo(): void {
    this.commit();
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneCharacter(this.character));
    this.character = next;
    this.emit('full');
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || this.pending !== null;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
