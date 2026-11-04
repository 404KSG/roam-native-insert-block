const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime } = require("./runtime-harness");

const hiddenCaret = ["rm-caret", "rm-caret-hidden"];

const renderInline = (options) => {
  const harness = createRuntime({
    collapsed: true,
    ownCaretClass: hiddenCaret,
    ...options,
  });
  try {
    assert.ok(harness.renderForContainer(), "insert control must render");
    return harness.buttonClassContains("native-insert-block-no-children");
  } finally {
    harness.unload();
  }
};

test("ordinary hidden-caret parents retain the v0.9.3 caret-clearance path", () => {
  assert.equal(
    renderInline({ scope: "ordinary" }),
    false,
    "ordinary parent hover must not take the collapse-control slot without positive page-focus evidence"
  );
});

test("only the structural main focused root uses its own Bullet when native caret is hidden", () => {
  assert.equal(renderInline({ scope: "main-root" }), true);
  assert.equal(
    renderInline({ scope: "main-root", ownCaretClass: null }),
    true,
    "an otherwise verified root may lack its own native caret"
  );

  for (const scope of ["ordinary", "sidebar-root", "descendant", "reference", "unknown"]) {
    assert.equal(
      renderInline({ scope }),
      false,
      `${scope} twin must retain the v0.9.3 caret-clearance path`
    );
  }

  assert.equal(
    renderInline({ scope: "main-root", ownCaretClass: ["rm-caret", "rm-caret-showing"] }),
    false,
    "a root whose own native caret is showing must retain the baseline path"
  );
});

test("Document Mode and Version Blocks retain their baseline routing", () => {
  const version = createRuntime({
    collapsed: true,
    scope: "main-root",
    ownCaretClass: ["rm-caret", "rm-caret-hidden", "rm-caret-closed"],
    versionBlock: true,
  });
  try {
    version.renderForContainer();
    assert.equal(
      version.buttonClassContains("native-insert-block-no-children"),
      false,
      "Version Block must retain baseline parent clearance"
    );
  } finally {
    version.unload();
  }

  const leaf = createRuntime({
    collapsed: false,
    scope: "main-root",
    ownCaretClass: hiddenCaret,
  });
  try {
    leaf.renderForContainer();
    assert.equal(leaf.buttonClassContains("native-insert-block-no-children"), true);
    assert.equal(leaf.activeObserverCount(), 1, "leaf must not activate focused-root scope watching");
  } finally {
    leaf.unload();
  }

  const documentMode = createRuntime({
    collapsed: true,
    scope: "main-root",
    ownCaretClass: hiddenCaret,
    documentMode: true,
  });
  try {
    documentMode.renderForContainer();
    assert.equal(
      documentMode.buttonClassContains("native-insert-block-document-mode"),
      true,
      "Document Mode must retain its published class"
    );
  } finally {
    documentMode.unload();
  }
});

test("exceptional controls are removed when their root scope invalidates or detaches", () => {
  for (const [scope, label] of [
    ["sidebar-root", "reparented sidebar copy"],
    ["ordinary", "navigated ordinary row"],
  ]) {
    const harness = createRuntime({
      collapsed: true,
      scope: "main-root",
      ownCaretClass: hiddenCaret,
    });
    try {
      harness.renderForContainer();
      assert.equal(harness.buttonClassContains("native-insert-block-no-children"), true);
      harness.container.setScope(scope);
      harness.triggerMutations();
      assert.equal(harness.buttonExists(), false, `${label} retained exceptional placement`);
    } finally {
      harness.unload();
    }
  }

  const detached = createRuntime({
    collapsed: true,
    scope: "main-root",
    ownCaretClass: hiddenCaret,
  });
  try {
    detached.renderForContainer();
    detached.container.setConnected(false);
    detached.triggerMutations();
    assert.equal(detached.buttonExists(), false, "detached exceptional root retained its control");
  } finally {
    detached.unload();
  }
});

test("scope invalidation makes an exceptional control stale before actions and unload cleans observers", async () => {
  const harness = createRuntime({
    collapsed: true,
    scope: "main-root",
    ownCaretClass: hiddenCaret,
  });
  try {
    const control = harness.renderForContainer();
    assert.ok(harness.activeObserverCount() >= 2, "only the active special root gets scope observers");
    harness.container.setScope("sidebar-root");
    await control.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0, "stale exceptional control must not mutate");
    assert.equal(harness.buttonExists(), false, "stale exceptional control must be removed");
  } finally {
    harness.unload();
  }
  assert.equal(harness.activeObserverCount(), 0, "unload must disconnect active-root observers");
});
