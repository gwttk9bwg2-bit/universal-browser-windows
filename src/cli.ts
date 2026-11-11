#!/usr/bin/env node
import { ApiServer } from "./api.js";
import { PlaywrightAdapter } from "./playwright-adapter.js";

const [command = "serve", ...args] = process.argv.slice(2);

if (command === "serve") {
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 3210;
  const server = new ApiServer({ port });
  const address = await server.start();
  process.stderr.write(`Universal Browser running at http://${address.host}:${address.port}\n`);
  const shutdown = async () => { await server.stop(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
} else if (command === "edge") {
  const executablePath = args[0] ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const server = new ApiServer({ port: 3210 });
  await server.start();
  await server.runtime.addAdapter(new PlaywrightAdapter({ id: "edge-local", browser: "edge", executablePath, headless: args.includes("--headless") }));
  server.runtime.agents.register("local-user", "Local user");
  server.runtime.agents.acquire("local-user", 300_000);
  process.stderr.write("Universal Browser and managed Edge are ready at http://127.0.0.1:3210\n");
} else {
  process.stderr.write("Usage: universal-browser [serve [--port=3210] | edge [executablePath] [--headless]]\n");
  process.exitCode = 1;
}
