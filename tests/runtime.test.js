const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime, defaultBlock } = require("./runtime-harness");

const WRAPPER_UID = "nautilus-log-plan-2026-09-09";
const WRAPPER_STRING =
  '[[Nautilus Log]] {{[[roam/render]]:((roam-render-Nautilus-Log-cljs)) 22 15 5 "#T0" 21}}';
const SLICE9 = WRAPPER_UID.slice(-9);
const RENDERER_UID = "roam-render-Nautilus-Log-cljs";

const wrapperBlock = (overrides = {}) => ({
  ":block/uid": WRAPPER_UID,
  ":block/order": 0,
  ":block/string": WRAPPER_STRING,
  ":block/children": [{ ":block/uid": "child0001" }],
  ":block/_children": [{ ":block/uid": "pageuid01" }],
  ...overrides,
});

const nautilusGraph = (extra = {}) => ({
  [WRAPPER_UID]: wrapperBlock(),
  [RENDERER_UID]: {
    ":block/uid": RENDERER_UID,
    ":block/order": 0,
    ":block/string": "(ns nautilus-log-v1 ...)",
    ":block/children": [],
    ":block/_children": [{ ":block/uid": "roam-render-Nautilus-Log" }],
  },
  child0001: {
    ":block/uid": "child0001",
    ":block/order": 0,
    ":block/string": "task",
    ":block/children": [],
    ":block/_children": [{ ":block/uid": WRAPPER_UID }],
  },
  pageuid01: {
    ":block/uid": "pageuid01",
    ":block/order": 0,
    ":block/string": "day",
    ":block/children": [{ ":block/uid": WRAPPER_UID }],
    ":block/_children": [],
  },
  ...extra,
});

const click = async (harness, keys = {}) => {
  const button = harness.renderForContainer();
  assert.ok(button, "insert control must render");
  const event = harness.event(keys);
  button.onMouseDown(event);
  await button.onClick(event);
  return button;
};

test("Shift-click deletes a long Nautilus wrapper UID rather than a 9-character slice", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph({
      [RENDERER_UID]: {
        ":block/uid": RENDERER_UID,
        ":block/order": 0,
        ":block/string": "(ns nautilus-log-v1 ...)",
        ":block/children": [],
        ":block/_children": [{ ":block/uid": "roam-render-Nautilus-Log" }],
      },
    }),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
    assert.equal(harness.blockGraph.has(WRAPPER_UID), false);
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
    assert.equal(
      harness.calls.delete.some((item) => item.block.uid === SLICE9),
      false
    );
  } finally {
    harness.unload();
  }
});

test("Shift-click keeps a realistic 9-character UID that contains a hyphen", async () => {
  const uid = "abc-def12";
  const harness = createRuntime({
    inputId: `block-input-main-${uid}`,
    blockUid: uid,
    graph: { [uid]: defaultBlock(uid) },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(harness.calls.delete.map((item) => item.block.uid), [uid]);
  } finally {
    harness.unload();
  }
});

test("Shift-click keeps a realistic 9-character UID that contains an underscore", async () => {
  const uid = "abc_def12";
  const harness = createRuntime({
    inputId: `block-input-main-${uid}`,
    blockUid: uid,
    graph: { [uid]: defaultBlock(uid) },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(harness.calls.delete.map((item) => item.block.uid), [uid]);
  } finally {
    harness.unload();
  }
});

test("Shift-click keeps a long custom UID that contains underscores", async () => {
  const uid = "my_custom_uid_hello";
  const harness = createRuntime({
    inputId: `block-input-main-${uid}`,
    blockUid: uid,
    graph: { [uid]: defaultBlock(uid) },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(harness.calls.delete.map((item) => item.block.uid), [uid]);
  } finally {
    harness.unload();
  }
});

test("sidebar window IDs that contain hyphens still resolve a 9-character UID", async () => {
  const uid = "123456789";
  const harness = createRuntime({
    inputId: `block-input-sidebar-outline-abcdefghi-${uid}`,
    blockUid: uid,
    graph: { [uid]: defaultBlock(uid) },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(harness.calls.delete.map((item) => item.block.uid), [uid]);
  } finally {
    harness.unload();
  }
});

test("sidebar window IDs that contain hyphens still resolve a long UID", async () => {
  const harness = createRuntime({
    inputId: `block-input-sidebar-outline-abcdefghi-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
  } finally {
    harness.unload();
  }
});

test("all five actions use the validated long UID and leave a slice suffix untouched", async () => {
  const victim = defaultBlock(SLICE9);
  victim[":block/string"] = "unrelated suffix collision";

  const cases = [
    {
      name: "below",
      keys: {},
      assert(harness) {
        assert.equal(harness.calls.create.length, 1);
        assert.equal(harness.calls.create[0].location["parent-uid"], "pageuid01");
        assert.equal(harness.calls.create[0].location.order, 1);
      },
    },
    {
      name: "above",
      keys: { altKey: true },
      assert(harness) {
        assert.equal(harness.calls.create[0].location["parent-uid"], "pageuid01");
        assert.equal(harness.calls.create[0].location.order, 0);
      },
    },
    {
      name: "child",
      keys: { metaKey: true },
      assert(harness) {
        assert.equal(harness.calls.create[0].location["parent-uid"], WRAPPER_UID);
        assert.equal(harness.calls.create[0].location.order, 1);
      },
    },
    {
      name: "wrap",
      keys: { ctrlKey: true },
      assert(harness) {
        assert.equal(harness.calls.create[0].location["parent-uid"], "pageuid01");
        assert.equal(harness.calls.move[0].block.uid, WRAPPER_UID);
      },
    },
    {
      name: "delete",
      keys: { shiftKey: true },
      assert(harness) {
        assert.deepEqual(harness.calls.delete.map((item) => item.block.uid), [
          WRAPPER_UID,
        ]);
      },
    },
  ];

  for (const item of cases) {
    const harness = createRuntime({
      inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
      graph: nautilusGraph({ [SLICE9]: victim }),
    });
    try {
      await click(harness, item.keys);
      item.assert(harness);
      assert.equal(
        harness.blockGraph.has(SLICE9),
        true,
        `${item.name} must not mutate the unrelated suffix collision`
      );
      assert.equal(
        harness.calls.delete.some((entry) => entry.block.uid === SLICE9),
        false
      );
      assert.equal(
        harness.calls.create.some(
          (entry) =>
            entry.location?.["parent-uid"] === SLICE9 ||
            entry.block?.uid === SLICE9
        ),
        false
      );
    } finally {
      harness.unload();
    }
  }
});

test("native data-block-uid identifies the owning block when auxiliary data-uid matches", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    dataUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
  } finally {
    harness.unload();
  }
});

test("conflicting shorter data-uid never overrides native data-block-uid", async () => {
  const shortUid = "2026-09-09";
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    dataUid: shortUid,
    graph: nautilusGraph({ [shortUid]: defaultBlock(shortUid) }),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.calls.create.length, 0);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has(shortUid), true);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("native data-block-uid lets the wrapper act while a hyphen-boundary suffix survives", async () => {
  const collisionUid = "2026-09-09";
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph({
      [collisionUid]: defaultBlock(collisionUid),
    }),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
    assert.equal(harness.blockGraph.has(WRAPPER_UID), false);
    assert.equal(harness.blockGraph.has(collisionUid), true);
  } finally {
    harness.unload();
  }
});

test("missing graph identity refuses delete instead of guessing a UID", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: {},
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 0);
    assert.ok(harness.statusElement());
    assert.match(
      harness.statusElement().textContent,
      /could not identify this block/i
    );
  } finally {
    harness.unload();
  }
});

test("page entities are rejected as insert targets", async () => {
  const uid = "SomePage";
  const harness = createRuntime({
    inputId: `block-input-main-${uid}`,
    blockUid: uid,
    graph: {
      [uid]: {
        ":block/uid": uid,
        ":node/title": "Some Page",
      },
    },
  });
  try {
    await click(harness);
    assert.equal(harness.calls.create.length, 0);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("a parent without its own input does not bind a nested child", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    skipOwnInput: true,
    nested: [{ inputId: "block-input-main-child0001", blockUid: "child0001" }],
    graph: nautilusGraph(),
  });
  try {
    const button = harness.renderForContainer();
    assert.equal(button, null);
    assert.equal(harness.buttonExists(), false);
    assert.equal(harness.blockGraph.has("child0001"), true);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
  } finally {
    harness.unload();
  }
});

test("nested descendant inputs never override the owning container input", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    nested: [{ inputId: "block-input-main-child0001", blockUid: "child0001" }],
    graph: nautilusGraph(),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
    assert.equal(harness.blockGraph.has("child0001"), true);
  } finally {
    harness.unload();
  }
});

test("a stale click after the input identity changes refuses mutation", async () => {
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: nautilusGraph({ "123456789": defaultBlock("123456789") }),
  });
  try {
    const button = harness.renderForContainer();
    const input = harness.container.querySelector("[id^='block-input']");
    input.id = `block-input-main-${WRAPPER_UID}`;
    await button.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has("123456789"), true);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("pointermove refreshes identity when the same container is reused", async () => {
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: nautilusGraph({ "123456789": defaultBlock("123456789") }),
  });
  try {
    harness.renderForContainer();
    const firstButton = harness.document.getElementById(
      "native-insert-block-btn-container"
    );
    const input = harness.container.querySelector("[id^='block-input']");
    input.id = `block-input-main-${WRAPPER_UID}`;
    harness.container.attributes["data-block-uid"] = WRAPPER_UID;
    const button = harness.pointerMove();
    assert.ok(button);
    assert.notEqual(
      harness.document.getElementById("native-insert-block-btn-container"),
      firstButton
    );
    await button.onClick(harness.event({ shiftKey: true }));
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [WRAPPER_UID]
    );
    assert.equal(harness.blockGraph.has("123456789"), true);
  } finally {
    harness.unload();
  }
});

test("a detached container never mutates the graph", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    const button = harness.renderForContainer();
    harness.container.isConnected = false;
    await button.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
  } finally {
    harness.unload();
  }
});

test("an unloaded control never performs a later action", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  const button = harness.renderForContainer();
  harness.unload();
  await button.onClick(harness.event({ shiftKey: true }));
  assert.equal(harness.calls.delete.length, 0);
  assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
});

test("inserting a block requests Roam focus before the textarea exists", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    await click(harness);
    assert.equal(harness.calls.create.length, 1);
    const createdUid = harness.calls.create[0].block.uid;
    harness.flushTimers();
    assert.ok(harness.calls.focus.length >= 1);
    assert.equal(harness.calls.focus[0].location["block-uid"], createdUid);
    assert.equal(harness.calls.focus[0].location["window-id"], "main");
    assert.equal(
      harness.calls.querySelector.some((selector) => /id\$=/.test(selector)),
      false,
      "must not globally query a UID suffix"
    );
  } finally {
    harness.unload();
  }
});

test("already focusing the same UID in another window still requests the intended window", async () => {
  const createdUid = "newuid001";
  const harness = createRuntime({
    inputId: `block-input-sidebar-outline-abcdefghi-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
    focusedBlock: { "window-id": "main", "block-uid": createdUid },
  });
  try {
    await click(harness);
    harness.flushTimers();
    assert.ok(harness.calls.focus.length >= 1);
    assert.equal(
      harness.calls.focus[0].location["window-id"],
      "sidebar-outline-abcdefghi"
    );
    assert.equal(harness.calls.focus[0].location["block-uid"], createdUid);
  } finally {
    harness.unload();
  }
});

test("DOM focus uses the exact window input rather than a suffix lookalike", async () => {
  const createdUid = "newuid001";
  let focusedId = null;
  const lookalike = {
    id: `block-input-main-prefix-${createdUid}`,
    value: "",
    focus() {
      focusedId = this.id;
    },
    setSelectionRange() {},
  };
  const exact = {
    id: `block-input-main-${createdUid}`,
    value: "",
    focus() {
      focusedId = this.id;
    },
    setSelectionRange() {},
  };
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
    extraInputs: [lookalike, exact],
  });
  try {
    await click(harness);
    harness.flushTimers();
    harness.flushAnimationFrames();
    assert.equal(focusedId, exact.id);
    assert.ok(harness.calls.focus.length >= 1);
    assert.equal(harness.calls.focus[0].location["block-uid"], createdUid);
    assert.equal(harness.calls.focus[0].location["window-id"], "main");
  } finally {
    harness.unload();
  }
});

test("focus API rejection does not become an unhandled Promise", async () => {
  let focusCalls = 0;
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    setBlockFocusAndSelection: () => {
      focusCalls += 1;
      return Promise.reject(new Error("focus failed"));
    },
  });
  try {
    await click(harness);
    harness.flushTimers();
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(focusCalls >= 1);
    assert.equal(harness.calls.create.length, 1);
  } finally {
    harness.unload();
  }
});

test("a thrown delete shows status and does not use window.alert", async () => {
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    deleteBlock: async (args) => {
      harness.calls.delete.push(args);
      throw new Error("delete failed");
    },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 1);
    assert.ok(harness.statusElement());
    assert.match(
      harness.statusElement().textContent,
      /could not complete that action/i
    );
    assert.equal(
      harness.statusElement().textContent.includes("123456789"),
      false
    );
  } finally {
    harness.unload();
  }
});

test("failed wrap rollback still removes only an empty unused parent for a long UID", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
    moveBlock: async (args) => {
      harness.calls.move.push(args);
      throw new Error("move failed");
    },
  });
  try {
    await click(harness, { ctrlKey: true });
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.delete.length, 1);
    assert.equal(harness.calls.delete[0].block.uid, "newuid001");
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
  } finally {
    harness.unload();
  }
});

test("unloading removes the status element and its timer", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: {},
  });
  await click(harness, { shiftKey: true });
  assert.ok(harness.statusElement());
  assert.ok(harness.pendingTimerCount() >= 1);
  harness.unload();
  assert.equal(harness.statusElement(), null);
  assert.equal(harness.pendingTimerCount(), 0);
});

test("a delete rejection after unload does not show status", async () => {
  let rejectDelete;
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    deleteBlock: (args) => {
      harness.calls.delete.push(args);
      return new Promise((_, reject) => {
        rejectDelete = reject;
      });
    },
  });
  try {
    const button = harness.renderForContainer();
    const operation = button.onClick(harness.event({ shiftKey: true }));
    await Promise.resolve();
    harness.unload();
    rejectDelete(new Error("delete failed"));
    await operation;
    assert.equal(harness.calls.delete.length, 1);
    assert.equal(harness.statusElement(), null);
  } finally {
    harness.unload();
  }
});

test("a create rejection after unload does not show status", async () => {
  let rejectCreate;
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((_, reject) => {
        rejectCreate = reject;
      });
    },
  });
  try {
    const button = harness.renderForContainer();
    const operation = button.onClick(harness.event());
    await Promise.resolve();
    harness.unload();
    rejectCreate(new Error("create failed"));
    await operation;
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.statusElement(), null);
  } finally {
    harness.unload();
  }
});

test("a stale control after unload and reload never mutates the graph", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  const button = harness.renderForContainer();
  harness.reload();
  await button.onClick(harness.event({ shiftKey: true }));
  assert.equal(harness.calls.delete.length, 0);
  assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
  assert.equal(harness.statusElement(), null);
});

test("a slower earlier insert does not steal focus from a newer insert", async () => {
  const resolvers = [];
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
  });
  try {
    const firstButton = harness.renderForContainer();
    const firstInsert = firstButton.onClick(harness.event());
    await Promise.resolve();
    const secondButton = harness.pointerMove();
    const secondInsert = secondButton.onClick(harness.event());
    await Promise.resolve();
    assert.equal(resolvers.length, 2);
    resolvers[1]();
    await secondInsert;
    resolvers[0]();
    await firstInsert;
    harness.flushTimers();
    assert.deepEqual(
      harness.calls.focus.map((item) => item.location["block-uid"]),
      ["newuid002"]
    );
  } finally {
    harness.unload();
  }
});

test("a wrap that finishes late does not steal focus from a newer insert", async () => {
  const resolvers = [];
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
  });
  try {
    const wrapButton = harness.renderForContainer();
    const wrapInsert = wrapButton.onClick(harness.event({ ctrlKey: true }));
    await Promise.resolve();
    const insertButton = harness.pointerMove();
    const laterInsert = insertButton.onClick(harness.event());
    await Promise.resolve();
    assert.equal(resolvers.length, 2);
    resolvers[1]();
    await laterInsert;
    resolvers[0]();
    await wrapInsert;
    harness.flushTimers();
    assert.deepEqual(
      harness.calls.focus.map((item) => item.location["block-uid"]),
      ["newuid002"]
    );
  } finally {
    harness.unload();
  }
});

test("an insert that finishes after unload and reload does not invalidate the new focus", async () => {
  const resolvers = [];
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
  });
  const firstButton = harness.renderForContainer();
  const firstInsert = firstButton.onClick(harness.event());
  await Promise.resolve();
  harness.reload();
  const secondButton = harness.pointerMove();
  const secondInsert = secondButton.onClick(harness.event());
  await Promise.resolve();
  resolvers[1]();
  await secondInsert;
  harness.flushTimers();
  assert.deepEqual(
    harness.calls.focus.map((item) => item.location["block-uid"]),
    ["newuid002"]
  );
  resolvers[0]();
  await firstInsert;
  harness.flushTimers();
  const focusedUids = harness.calls.focus.map(
    (item) => item.location["block-uid"]
  );
  assert.equal(focusedUids.includes("newuid001"), false);
  assert.ok(focusedUids.every((uid) => uid === "newuid002"));
});

test("an old click after pointermove to another block never mutates", async () => {
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: {
      "123456789": defaultBlock("123456789"),
      other0001: defaultBlock("other0001"),
    },
  });
  try {
    const oldButton = harness.renderForContainer();
    const other = harness.createContainer({
      inputId: "block-input-main-other0001",
    });
    harness.pointerMove(other);
    await oldButton.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has("123456789"), true);
    assert.equal(harness.blockGraph.has("other0001"), true);
  } finally {
    harness.unload();
  }
});

test("an old click after pointermove leaves the block never mutates", async () => {
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: { "123456789": defaultBlock("123456789") },
  });
  try {
    const oldButton = harness.renderForContainer();
    harness.pointerMove(null);
    await oldButton.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has("123456789"), true);
  } finally {
    harness.unload();
  }
});

test("id-only input without native data-block-uid refuses even if a suffix block exists", async () => {
  const collisionUid = "2026-09-09";
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: null,
    graph: nautilusGraph({ [collisionUid]: defaultBlock(collisionUid) }),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.calls.create.length, 0);
    assert.equal(harness.blockGraph.has(collisionUid), true);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("missing complete UID with a living boundary suffix never writes on delete or insert", async () => {
  const collisionUid = "2026-09-09";
  for (const keys of [{ shiftKey: true }, {}]) {
    const harness = createRuntime({
      inputId: `block-input-main-${WRAPPER_UID}`,
      blockUid: WRAPPER_UID,
      graph: {
        [collisionUid]: defaultBlock(collisionUid),
        [RENDERER_UID]: nautilusGraph()[RENDERER_UID],
      },
    });
    try {
      await click(harness, keys);
      assert.equal(harness.calls.delete.length, 0);
      assert.equal(harness.calls.create.length, 0);
      assert.equal(harness.blockGraph.has(collisionUid), true);
      assert.equal(harness.blockGraph.has(RENDERER_UID), true);
    } finally {
      harness.unload();
    }
  }
});

test("a throwing complete-UID pull never falls back to a living suffix", async () => {
  const collisionUid = "2026-09-09";
  const pulled = [];
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph({ [collisionUid]: defaultBlock(collisionUid) }),
    pullBlock: (_query, lookup) => {
      const uid = lookup?.[1];
      pulled.push(uid);
      if (uid === WRAPPER_UID) throw new Error("pull failed");
      return defaultBlock(uid);
    },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(pulled, [WRAPPER_UID]);
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(collisionUid), true);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
  } finally {
    harness.unload();
  }
});

test("a null complete-UID pull never falls back to a living suffix", async () => {
  const collisionUid = "2026-09-09";
  const pulled = [];
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph({ [collisionUid]: defaultBlock(collisionUid) }),
    pullBlock: (_query, lookup) => {
      const uid = lookup?.[1];
      pulled.push(uid);
      if (uid === WRAPPER_UID) return null;
      return defaultBlock(uid);
    },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(pulled, [WRAPPER_UID]);
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(collisionUid), true);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
  } finally {
    harness.unload();
  }
});

test("legacy data-uid without native data-block-uid refuses even if the graph has one match", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: null,
    dataUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("a native data-block-uid change between render and click refuses mutation", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: WRAPPER_UID,
    graph: nautilusGraph(),
  });
  try {
    const button = harness.renderForContainer();
    harness.container.attributes["data-block-uid"] = "child0001";
    await button.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has("child0001"), true);
  } finally {
    harness.unload();
  }
});

test("native data-block-uid that does not match the input id refuses mutation", async () => {
  const harness = createRuntime({
    inputId: `block-input-main-${WRAPPER_UID}`,
    blockUid: "child0001",
    graph: nautilusGraph(),
  });
  try {
    await click(harness, { shiftKey: true });
    assert.equal(harness.calls.delete.length, 0);
    assert.equal(harness.blockGraph.has(WRAPPER_UID), true);
    assert.equal(harness.blockGraph.has("child0001"), true);
    assert.ok(harness.statusElement());
  } finally {
    harness.unload();
  }
});

test("Daily Notes log-outline Nautilus wrapper uses the native container UID", async () => {
  const liveUid = "nautilus-log-plan-2026-09-10";
  const harness = createRuntime({
    inputId: `block-input-log-outline-${liveUid}`,
    blockUid: liveUid,
    inputTagName: "DIV",
    graph: {
      [liveUid]: {
        ":block/uid": liveUid,
        ":block/order": 0,
        ":block/string": WRAPPER_STRING,
        ":block/children": [{ ":block/uid": "child0001" }],
        ":block/_children": [{ ":block/uid": "pageuid01" }],
      },
      child0001: {
        ":block/uid": "child0001",
        ":block/order": 0,
        ":block/string": "task",
        ":block/children": [],
        ":block/_children": [{ ":block/uid": liveUid }],
      },
      pageuid01: {
        ":block/uid": "pageuid01",
        ":block/order": 0,
        ":block/string": "day",
        ":block/children": [{ ":block/uid": liveUid }],
        ":block/_children": [],
      },
      [RENDERER_UID]: nautilusGraph()[RENDERER_UID],
      "2026-09-10": defaultBlock("2026-09-10"),
    },
  });
  try {
    await click(harness, { shiftKey: true });
    assert.deepEqual(
      harness.calls.delete.map((item) => item.block.uid),
      [liveUid]
    );
    assert.equal(harness.blockGraph.has(liveUid), false);
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
    assert.equal(harness.blockGraph.has("2026-09-10"), true);
    assert.equal(harness.blockGraph.has("child0001"), true);
  } finally {
    harness.unload();
  }
});

test("log-outline child insert focuses the new block in window log-outline", async () => {
  const liveUid = "nautilus-log-plan-2026-09-10";
  const harness = createRuntime({
    inputId: `block-input-log-outline-${liveUid}`,
    blockUid: liveUid,
    inputTagName: "DIV",
    graph: {
      [liveUid]: {
        ":block/uid": liveUid,
        ":block/order": 0,
        ":block/string": WRAPPER_STRING,
        ":block/children": [{ ":block/uid": "child0001" }],
        ":block/_children": [{ ":block/uid": "pageuid01" }],
      },
      [RENDERER_UID]: nautilusGraph()[RENDERER_UID],
    },
    focusedBlock: null,
  });
  try {
    await click(harness, { metaKey: true });
    assert.equal(harness.calls.create[0].location["parent-uid"], liveUid);
    harness.flushTimers();
    assert.equal(harness.calls.focus[0].location["block-uid"], "newuid001");
    assert.equal(harness.calls.focus[0].location["window-id"], "log-outline");
    assert.equal(harness.blockGraph.has(RENDERER_UID), true);
  } finally {
    harness.unload();
  }
});

test("a newer delete invalidates pending focus from an earlier insert without cancelling that insert", async () => {
  let resolveCreate;
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: {
      "123456789": defaultBlock("123456789"),
      other0001: defaultBlock("other0001"),
    },
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    },
  });
  try {
    const insertButton = harness.renderForContainer();
    const insertOp = insertButton.onClick(harness.event());
    await Promise.resolve();
    assert.equal(harness.calls.create.length, 1);
    const other = harness.createContainer({
      inputId: "block-input-main-other0001",
      blockUid: "other0001",
    });
    const deleteButton = harness.pointerMove(other);
    await deleteButton.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete[0].block.uid, "other0001");
    assert.equal(harness.blockGraph.has("other0001"), false);
    resolveCreate();
    await insertOp;
    harness.flushTimers();
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.focus.length, 0);
  } finally {
    harness.unload();
  }
});

test("a newer delete invalidates pending wrap focus without cancelling the wrap", async () => {
  let resolveCreate;
  const harness = createRuntime({
    inputId: "block-input-main-123456789",
    graph: {
      "123456789": defaultBlock("123456789"),
      other0001: defaultBlock("other0001"),
    },
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    },
  });
  try {
    const wrapButton = harness.renderForContainer();
    const wrapOp = wrapButton.onClick(harness.event({ ctrlKey: true }));
    await Promise.resolve();
    const other = harness.createContainer({
      inputId: "block-input-main-other0001",
      blockUid: "other0001",
    });
    const deleteButton = harness.pointerMove(other);
    await deleteButton.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.calls.delete[0].block.uid, "other0001");
    assert.equal(harness.blockGraph.has("other0001"), false);
    resolveCreate();
    await wrapOp;
    harness.flushTimers();
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.move.length, 1);
    assert.equal(harness.calls.focus.length, 0);
  } finally {
    harness.unload();
  }
});

test("a newer delete cancels a queued DOM focus frame from an earlier insert", async () => {
  const createdUid = "newuid001";
  let focusedId = null;
  const exact = {
    id: `block-input-main-${createdUid}`,
    value: "",
    focus() {
      focusedId = this.id;
    },
    setSelectionRange() {},
  };
  let resolveCreate;
  const harness = createRuntime({
    extraInputs: [exact],
    graph: {
      "123456789": defaultBlock("123456789"),
      other0001: defaultBlock("other0001"),
    },
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    },
  });
  try {
    const insertButton = harness.renderForContainer();
    const insertOp = insertButton.onClick(harness.event());
    await Promise.resolve();
    resolveCreate();
    await insertOp;
    harness.flushTimers();
    const other = harness.createContainer({
      inputId: "block-input-main-other0001",
      blockUid: "other0001",
    });
    const deleteButton = harness.pointerMove(other);
    await deleteButton.onClick(harness.event({ shiftKey: true }));
    assert.equal(harness.blockGraph.has("other0001"), false);
    harness.flushAnimationFrames();
    assert.equal(focusedId, null);
  } finally {
    harness.unload();
  }
});
