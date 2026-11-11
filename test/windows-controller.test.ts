import { describe, expect, it } from "vitest";
import { WindowsController, isWindowsReadAction } from "../src/windows-controller.js";

describe("WindowsController", () => {
  it("classifies observation separately from input", () => {
    expect(isWindowsReadAction({ type: "cursor" })).toBe(true);
    expect(isWindowsReadAction({ type: "screenshot" })).toBe(true);
    expect(isWindowsReadAction({ type: "click", x: 1, y: 1 })).toBe(false);
  });

  it.skipIf(process.platform !== "win32")("reads the real cursor and window list", async () => {
    const controller = new WindowsController();
    const cursor = await controller.execute({ type: "cursor" }) as { x: number; y: number };
    expect(Number.isFinite(cursor.x)).toBe(true);
    expect(Number.isFinite(cursor.y)).toBe(true);
    const windows = await controller.execute({ type: "list_windows" }) as Array<{ title: string }>;
    expect(Array.isArray(windows)).toBe(true);
    const automation = await controller.execute({ type: "uia_snapshot", maxDepth: 1, maxNodes: 30 }) as { nodes: number };
    expect(automation.nodes).toBeGreaterThan(0);
  }, 30_000);
});
