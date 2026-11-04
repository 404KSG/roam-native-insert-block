#!/usr/bin/env node
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

// Explicit local-only assets. No production graph, dependency install, or API.
const root = path.resolve(__dirname, "..");
const assets = new Map([
  ["/", ["tests/layout-fixture.html", "text/html"]],
  ["/tests/layout-fixture.js", ["tests/layout-fixture.js", "text/javascript"]],
  ["/roamjs.js", ["roamjs.js", "text/javascript"]],
  ["/extension.js", ["extension.js", "text/javascript"]],
]);
const server = http.createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url, "http://127.0.0.1").pathname);
  if (request.method !== "GET" || !asset) { response.writeHead(404); response.end(); return; }
  try {
    const body = await fs.readFile(path.join(root, asset[0]));
    response.writeHead(200, { "content-type": `${asset[1]}; charset=utf-8`, "cache-control": "no-store" });
    response.end(body);
  } catch { response.writeHead(404); response.end("Build the extension before running this fixture."); }
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log(`Native Insert Block real-layout fixture: http://127.0.0.1:${server.address().port}/`);
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  server.closeAllConnections(); server.close(() => process.exit(0));
});
