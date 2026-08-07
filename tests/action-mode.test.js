const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveActionMode } = require("../src/action-mode");

test("each supported modifier resolves to one documented action", () => {
  assert.equal(resolveActionMode({}), "below");
  assert.equal(resolveActionMode({ altKey: true }), "above");
  assert.equal(resolveActionMode({ metaKey: true }), "child");
  assert.equal(resolveActionMode({ ctrlKey: true }), "wrap");
  assert.equal(resolveActionMode({ shiftKey: true }), "delete");
});

test("combined modifiers never resolve to a block action", () => {
  assert.equal(
    resolveActionMode({ shiftKey: true, metaKey: true }),
    null
  );
  assert.equal(
    resolveActionMode({ ctrlKey: true, altKey: true }),
    null
  );
  assert.equal(
    resolveActionMode({ shiftKey: true, ctrlKey: true, metaKey: true }),
    null
  );
});
