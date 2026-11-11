#!/usr/bin/env node
import WebSocket from "ws";

const browserOrigin = process.argv.find((argument) => /^(chrome|moz)-extension:\/\//.test(argument));
const connectionId = process.env.UB_CONNECTION_ID ?? browserOrigin ?? process.argv[2] ?? "default";
const daemonUrl = new URL(process.env.UB_NATIVE_URL ?? "ws://127.0.0.1:3210/native");
daemonUrl.searchParams.set("id", connectionId);
if (process.env.UB_NATIVE_TOKEN) daemonUrl.searchParams.set("token", process.env.UB_NATIVE_TOKEN);
let buffer = Buffer.alloc(0);
let ws: WebSocket | undefined;
const queue: string[] = [];
const maxNativeMessageBytes = 64 * 1024 * 1024;
const maxQueuedMessages = 100;

function log(message: string): void { process.stderr.write(`[universal-browser-native] ${message}\n`); }
function writeNative(value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}
function connect(): void {
  ws = new WebSocket(daemonUrl);
  ws.on("open", () => { log(`connected as ${connectionId}`); while (queue.length) ws?.send(queue.shift()!); });
  ws.on("message", (data) => { try { writeNative(JSON.parse(String(data))); } catch (error) { log(`invalid daemon message: ${String(error)}`); } });
  ws.on("close", () => { log("daemon disconnected; retrying"); setTimeout(connect, 1500); });
  ws.on("error", (error) => log(error.message));
}

process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32LE(0);
    if (size > maxNativeMessageBytes) { log("message exceeds the 64 MB bridge safety limit"); process.exit(2); }
    if (buffer.length < size + 4) break;
    const message = buffer.subarray(4, 4 + size).toString("utf8"); buffer = buffer.subarray(4 + size);
    if (ws?.readyState === WebSocket.OPEN) ws.send(message);
    else {
      if (queue.length >= maxQueuedMessages) queue.shift();
      queue.push(message);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
connect();
