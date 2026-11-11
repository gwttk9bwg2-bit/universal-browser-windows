import { z } from "zod";

export const frameTargetSchema = z.object({
  selector: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  urlContains: z.string().min(1).optional()
}).refine((value) => Boolean(value.selector || value.name || value.urlContains), "A frame selector, name, or URL fragment is required.");

const dialogResponseSchema = z.object({ accept: z.boolean(), promptText: z.string().optional() });

export const browserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("list_tabs") }),
  z.object({ type: z.literal("snapshot") }),
  z.object({ type: z.literal("accessibility_snapshot") }),
  z.object({ type: z.literal("screenshot"), path: z.string().optional(), fullPage: z.boolean().optional() }),
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({ type: z.literal("click"), selector: z.string().min(1), frame: frameTargetSchema.optional(), expectPopup: z.boolean().optional(), dialog: dialogResponseSchema.optional() }),
  z.object({ type: z.literal("click_at"), x: z.number().nonnegative(), y: z.number().nonnegative(), button: z.enum(["left", "right", "middle"]).optional(), clicks: z.number().int().min(1).max(3).optional() }),
  z.object({ type: z.literal("scroll_at"), x: z.number().nonnegative().optional(), y: z.number().nonnegative().optional(), deltaX: z.number().optional(), deltaY: z.number() }),
  z.object({ type: z.literal("drag_at"), fromX: z.number().nonnegative(), fromY: z.number().nonnegative(), toX: z.number().nonnegative(), toY: z.number().nonnegative(), durationMs: z.number().int().min(50).max(10_000).optional() }),
  z.object({ type: z.literal("type"), selector: z.string().min(1), text: z.string(), submit: z.boolean().optional(), frame: frameTargetSchema.optional() }),
  z.object({ type: z.literal("press"), key: z.string().min(1) }),
  z.object({ type: z.literal("select"), selector: z.string().min(1), value: z.string(), frame: frameTargetSchema.optional() }),
  z.object({ type: z.literal("upload"), selector: z.string().min(1), paths: z.array(z.string().min(1)).min(1), frame: frameTargetSchema.optional() }),
  z.object({ type: z.literal("download"), selector: z.string().min(1), path: z.string().optional(), frame: frameTargetSchema.optional() }),
  z.object({ type: z.literal("grant_permissions"), permissions: z.array(z.string().min(1)).min(1), origin: z.string().url().optional() }),
  z.object({ type: z.literal("wait_for"), selector: z.string().min(1).optional(), text: z.string().min(1).optional(), urlContains: z.string().min(1).optional(), timeoutMs: z.number().int().min(100).max(120_000).optional(), frame: frameTargetSchema.optional() }).refine((value) => Boolean(value.selector || value.text || value.urlContains), "A selector, text, or URL fragment is required."),
  z.object({ type: z.literal("evaluate"), expression: z.string().min(1) }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({ type: z.literal("reload") }),
  z.object({ type: z.literal("new_tab"), url: z.string().url().optional() }),
  z.object({ type: z.literal("close_tab"), tabId: z.string().optional() })
]);

export const browserSchema = z.enum(["chrome", "edge", "firefox", "chromium"]);
