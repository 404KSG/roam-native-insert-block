const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const result = spawnSync(
  process.execPath,
  [
    "--experimental-test-coverage",
    "--test",
    "tests/action-mode.test.js",
    "tests/actions.test.js",
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

console.log("Native Insert Block coverage attribution: PASS");
