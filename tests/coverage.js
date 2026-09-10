const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const result = spawnSync(
  process.execPath,
  [
    "--experimental-test-coverage",
    "--test",
    "tests/action-mode.test.js",
    "tests/actions.test.js",
    "tests/runtime.test.js",
  ],
  { cwd: process.cwd(), encoding: "utf8" }
);

const output = `${result.stdout || ""}${result.stderr || ""}`;
process.stdout.write(output);

assert.equal(result.status, 0, "coverage test run must pass");
assert.match(
  output,
  /action-mode\.js\s+\|/,
  "coverage must include production action-mode logic, not an empty 100% report"
);
assert.match(
  output,
  /extension\.js\s+\|/,
  "coverage must attribute runtime tests to extension.js"
);

const runtimeLine = output
  .split("\n")
  .find((line) => /(?:^|\s)extension\.js\s+\|/.test(line));
assert.ok(runtimeLine, "coverage report must include an extension.js row");
const runtimePercent = Number(
  runtimeLine.match(/extension\.js\s+\|\s+(\d+(?:\.\d+)?)/)?.[1]
);
assert.equal(Number.isFinite(runtimePercent), true);
assert.ok(
  runtimePercent > 0,
  "runtime coverage attribution must be non-zero"
);

console.log(
  `Native Insert Block coverage attribution: PASS (extension.js line ${runtimePercent}%)`
);
