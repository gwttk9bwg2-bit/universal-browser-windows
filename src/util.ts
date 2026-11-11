import { randomUUID } from "node:crypto";

export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
