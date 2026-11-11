import { resolve } from "node:path";

export function dataDirectory(): string {
  if (process.env.UB_DATA_DIR) return resolve(process.env.UB_DATA_DIR);
  if (process.platform === "win32" && process.env.LOCALAPPDATA) return resolve(process.env.LOCALAPPDATA, "UniversalBrowser", "data");
  return resolve(".universal-browser");
}
