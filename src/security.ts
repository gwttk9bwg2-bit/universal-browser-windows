import { createHash, randomBytes } from "node:crypto";
import type { BrowserAction, RiskLevel } from "./types.js";

const secretKeys = /cookie|authorization|token|password|secret|credential|set-cookie/i;
const sensitiveText = /(bearer\s+[a-z0-9._-]+|(?:api[_-]?key|password|token)\s*[:=]\s*[^\s,;]+)/gi;

export function redact<T>(value: T, depth = 0): T {
  if (depth > 10) return "[MAX_DEPTH]" as T;
  if (typeof value === "string") return value.replace(sensitiveText, "[REDACTED]") as T;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = secretKeys.test(key) ? "[REDACTED]" : redact(item, depth + 1);
    }
    return out as T;
  }
  return value;
}

export function actionRisk(action: BrowserAction): RiskLevel {
  if (["list_tabs", "snapshot", "accessibility_snapshot", "screenshot"].includes(action.type)) return "read";
  if (["evaluate", "upload", "grant_permissions"].includes(action.type)) return "sensitive";
  if (action.type === "click" && /(delete|remove|purchase|pay|checkout|注销|删除|付款|购买)/i.test(action.selector)) {
    return "destructive";
  }
  if (action.type === "type" && /(password|card|cvv|token|secret)/i.test(action.selector)) return "sensitive";
  return "write";
}

interface Approval {
  hash: string;
  agentId: string;
  sessionId: string;
  actionType: string;
  expiresAt: number;
  used: boolean;
}

export class PermissionManager {
  #approvals = new Map<string, Approval>();

  createApproval(agentId: string, sessionId: string, actionType: string, ttlMs = 120_000): string {
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    this.#approvals.set(hash, { hash, agentId, sessionId, actionType, expiresAt: Date.now() + ttlMs, used: false });
    return token;
  }

  authorize(agentId: string, sessionId: string, action: BrowserAction, token?: string): { allowed: boolean; risk: RiskLevel; reason?: string } {
    const risk = actionRisk(action);
    if (risk === "read" || risk === "write") return { allowed: true, risk };
    if (!token) return { allowed: false, risk, reason: "This action needs one-time human approval." };
    const hash = createHash("sha256").update(token).digest("hex");
    const approval = this.#approvals.get(hash);
    if (!approval || approval.used || approval.expiresAt < Date.now()) return { allowed: false, risk, reason: "Approval is invalid or expired." };
    if (approval.agentId !== agentId || approval.sessionId !== sessionId || approval.actionType !== action.type) {
      return { allowed: false, risk, reason: "Approval does not match this action." };
    }
    approval.used = true;
    return { allowed: true, risk };
  }
}

export function isCaptcha(text: string): boolean {
  return /(captcha|recaptcha|hcaptcha|turnstile|verify you are human|人机验证|验证码)/i.test(text);
}
