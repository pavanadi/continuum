import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { State } from "../agent/types.ts";
import { assertState } from './validate.ts';

/** Local fixture persistence only; this is not a RawTree integration.
 * One worker must own a file. Atomic replacement does not coordinate writers.
 */
export class FileMemory {
  private readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  async load(): Promise<State | null> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    }

    const state: unknown = JSON.parse(contents);
    assertState(state);
    return state;
  }

  async save(state: State): Promise<void> {
    assertState(state);
    const contents = JSON.stringify(state, null, 2) + "\n";
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporaryPath, "wx", 0o600);
      try {
        await file.writeFile(contents, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.path);
    } finally {
      // A successful rename removes the temporary name. Other cleanup failures surface.
      await unlink(temporaryPath).catch((error: unknown) => {
        if (!hasCode(error, "ENOENT")) throw error;
      });
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
