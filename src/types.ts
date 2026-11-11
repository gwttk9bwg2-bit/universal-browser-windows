export type BrowserKind = "chrome" | "edge" | "firefox" | "chromium";
export type ConnectionKind = "cdp" | "extension" | "managed";
export type RiskLevel = "read" | "write" | "sensitive" | "destructive";
export type SessionState = "connecting" | "ready" | "paused" | "disconnected" | "error";

export interface AgentIdentity {
  id: string;
  name: string;
  connectedAt: string;
  lastSeenAt: string;
}

export interface BrowserSessionInfo {
  id: string;
  name: string;
  browser: BrowserKind;
  connection: ConnectionKind;
  state: SessionState;
  humanControlled: boolean;
  activeUrl?: string;
  activeTitle?: string;
  connectedAt: string;
  capabilities: string[];
  error?: string;
}

export interface FrameTarget {
  selector?: string;
  name?: string;
  urlContains?: string;
}

export interface DialogResponse {
  accept: boolean;
  promptText?: string;
}

export type BrowserAction =
  | { type: "list_tabs" }
  | { type: "snapshot" }
  | { type: "accessibility_snapshot" }
  | { type: "screenshot"; path?: string; fullPage?: boolean }
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; frame?: FrameTarget; expectPopup?: boolean; dialog?: DialogResponse }
  | { type: "click_at"; x: number; y: number; button?: "left" | "right" | "middle"; clicks?: number }
  | { type: "scroll_at"; x?: number; y?: number; deltaX?: number; deltaY: number }
  | { type: "drag_at"; fromX: number; fromY: number; toX: number; toY: number; durationMs?: number }
  | { type: "type"; selector: string; text: string; submit?: boolean; frame?: FrameTarget }
  | { type: "press"; key: string }
  | { type: "select"; selector: string; value: string; frame?: FrameTarget }
  | { type: "upload"; selector: string; paths: string[]; frame?: FrameTarget }
  | { type: "download"; selector: string; path?: string; frame?: FrameTarget }
  | { type: "grant_permissions"; permissions: string[]; origin?: string }
  | { type: "wait_for"; selector?: string; text?: string; urlContains?: string; timeoutMs?: number; frame?: FrameTarget }
  | { type: "evaluate"; expression: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "new_tab"; url?: string }
  | { type: "close_tab"; tabId?: string };

export interface BrowserActionRequest {
  agentId: string;
  sessionId: string;
  action: BrowserAction;
  approvalToken?: string;
}

export interface BrowserEvent {
  id: string;
  sessionId: string;
  kind: "page" | "console" | "network" | "websocket" | "download" | "security" | "control";
  at: string;
  data: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  at: string;
  agentId: string;
  sessionId?: string;
  action: string;
  risk: RiskLevel;
  outcome: "allowed" | "blocked" | "failed" | "completed";
  details: Record<string, unknown>;
}

export interface AutomationStep {
  id: string;
  action: BrowserAction;
  retry?: number;
  timeoutMs?: number;
}

export interface AutomationTask {
  id: string;
  name: string;
  agentId: string;
  sessionId: string;
  state: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  currentStep: number;
  steps: AutomationStep[];
  createdAt: string;
  updatedAt: string;
  error?: string;
  results: unknown[];
}

export interface TestCase {
  name: string;
  steps: AutomationStep[];
  assertions: Array<
    | { type: "url_contains"; value: string }
    | { type: "title_contains"; value: string }
    | { type: "text_visible"; value: string }
    | { type: "selector_visible"; value: string }
  >;
}
