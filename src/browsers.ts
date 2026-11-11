import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BrowserKind } from "./types.js";

export function browserExecutableCandidates(browser: BrowserKind): string[] {
  if (process.platform !== "win32") return [];
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const edge = [
    join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")
  ];
  const chrome = [
    join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
  ];
  const firefox = [
    join(programFiles, "Mozilla Firefox", "firefox.exe"),
    join(programFilesX86, "Mozilla Firefox", "firefox.exe"),
    join(localAppData, "Mozilla Firefox", "firefox.exe")
  ];
  if (browser === "edge") return edge;
  if (browser === "chrome") return chrome;
  if (browser === "firefox") return firefox;
  return [...edge, ...chrome];
}

export function findBrowserExecutable(browser: BrowserKind): string | undefined {
  return browserExecutableCandidates(browser).find((candidate) => existsSync(candidate));
}

export function detectedBrowsers(): Array<{ browser: BrowserKind; executablePath: string }> {
  return (["edge", "chrome", "firefox"] as BrowserKind[]).flatMap((browser) => {
    const executablePath = findBrowserExecutable(browser);
    return executablePath ? [{ browser, executablePath }] : [];
  });
}
