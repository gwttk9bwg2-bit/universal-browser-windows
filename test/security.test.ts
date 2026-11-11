import { describe, expect, it } from "vitest";
import { PermissionManager, actionRisk, redact } from "../src/security.js";

describe("security", () => {
  it("redacts secrets recursively", () => expect(redact({ authorization: "Bearer abc", nested: { password: "hello" }, text: "token=xyz" })).toEqual({ authorization: "[REDACTED]", nested: { password: "[REDACTED]" }, text: "[REDACTED]" }));
  it("classifies destructive clicks", () => expect(actionRisk({ type: "click", selector: "button[data-action=delete]" })).toBe("destructive"));
  it("requires approval before reading local upload files or granting permissions", () => {
    expect(actionRisk({ type: "upload", selector: "input", paths: ["private.txt"] })).toBe("sensitive");
    expect(actionRisk({ type: "grant_permissions", permissions: ["geolocation"] })).toBe("sensitive");
  });
  it("uses approvals once and binds them", () => {
    const permissions = new PermissionManager(); const action = { type: "evaluate", expression: "1+1" } as const;
    const token = permissions.createApproval("a", "s", "evaluate");
    expect(permissions.authorize("b", "s", action, token).allowed).toBe(false);
    expect(permissions.authorize("a", "s", action, token).allowed).toBe(true);
    expect(permissions.authorize("a", "s", action, token).allowed).toBe(false);
  });
});
