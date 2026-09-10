const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime } = require("./runtime-harness");

const createHarness = (options) => createRuntime(options);

test("a plain context-menu click never inserts a block", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    await button.onContextMenu(harness.event({ type: "contextmenu" }));
    assert.equal(harness.calls.create.length, 0);
  } finally {
    harness.unload();
  }
});

test("a plain click inserts a sibling below", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    const event = harness.event();
    button.onMouseDown(event);
    await button.onClick(event);
    assert.equal(harness.calls.create[0].location["parent-uid"], "parent001");
    assert.equal(harness.calls.create[0].location.order, 2);
  } finally {
    harness.unload();
  }
});

test("mouse down on the insert control prevents native text selection", () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    let prevented = 0;
    let stopped = 0;

    button.onMouseDown(
      harness.event({
        preventDefault: () => {
          prevented += 1;
        },
        shiftKey: true,
        stopPropagation: () => {
          stopped += 1;
        },
      })
    );

    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
    assert.equal(
      harness.calls.delete.length,
      0,
      "mouse down never performs the action"
    );
  } finally {
    harness.unload();
  }
});

test("one Shift press suppresses selection and deletes exactly once", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    let prevented = 0;
    let stopped = 0;
    const event = harness.event({
      shiftKey: true,
      preventDefault: () => {
        prevented += 1;
      },
      stopPropagation: () => {
        stopped += 1;
      },
    });

    button.onMouseDown(event);
    await button.onClick(event);

    assert.equal(prevented, 2);
    assert.equal(stopped, 2);
    assert.equal(harness.calls.delete.length, 1);
    assert.equal(harness.calls.delete[0].block.uid, "123456789");
  } finally {
    harness.unload();
  }
});

test("Option-click inserts a sibling above", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    const event = harness.event({ altKey: true });
    button.onMouseDown(event);
    await button.onClick(event);
    assert.equal(harness.calls.create[0].location["parent-uid"], "parent001");
    assert.equal(harness.calls.create[0].location.order, 1);
  } finally {
    harness.unload();
  }
});

test("Command-click appends a child", async () => {
  const harness = createHarness({
    pullBlock: (_query, lookup) => ({
      ":block/uid": lookup?.[1],
      ":block/order": 1,
      ":block/string": "",
      ":block/children": [
        { ":block/uid": "child0001" },
        { ":block/uid": "child0002" },
      ],
      ":block/_children": [{ ":block/uid": "parent001" }],
    }),
  });
  try {
    const button = harness.renderForContainer();
    const event = harness.event({ metaKey: true });
    button.onMouseDown(event);
    await button.onClick(event);
    assert.equal(harness.calls.create[0].location["parent-uid"], "123456789");
    assert.equal(harness.calls.create[0].location.order, 2);
  } finally {
    harness.unload();
  }
});

test("Control-click wraps the block in a new parent", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ ctrlKey: true }));
    assert.equal(
      harness.calls.create[0].location["parent-uid"],
      "parent001"
    );
    assert.equal(harness.calls.create[0].location.order, 1);
    assert.equal(harness.calls.create[0].block.string, "");
    assert.equal(harness.calls.create[0].block.uid, "newuid001");
    assert.equal(
      harness.calls.move[0].location["parent-uid"],
      "newuid001"
    );
    assert.equal(harness.calls.move[0].location.order, 0);
    assert.equal(harness.calls.move[0].block.uid, "123456789");
  } finally {
    harness.unload();
  }
});

test("one Control press wraps the block at most once", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    button.onMouseDown(harness.event({ ctrlKey: true }));
    await button.onContextMenu(
      harness.event({ ctrlKey: true, type: "contextmenu" })
    );
    await button.onClick(harness.event({ ctrlKey: true }));

    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.move.length, 1);
  } finally {
    harness.unload();
  }
});

test("shift-click waits for Roam to finish deleting the block", async () => {
  let finishDelete;
  const harness = createHarness({
    deleteBlock: (args) => {
      harness.calls.delete.push(args);
      return new Promise((resolve) => {
        finishDelete = resolve;
      });
    },
  });
  try {
    const button = harness.renderForContainer();
    let settled = false;
    const operation = button.onClick(harness.event({ shiftKey: true })).then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(harness.calls.delete.length, 1);
    finishDelete();
    await operation;
    assert.equal(settled, true);
  } finally {
    harness.unload();
  }
});

test("combined modifiers never perform a block action", async () => {
  const harness = createHarness();
  try {
    const button = harness.renderForContainer();
    await button.onClick(
      harness.event({ shiftKey: true, metaKey: true })
    );

    assert.deepEqual(
      {
        create: harness.calls.create,
        move: harness.calls.move,
        update: harness.calls.update,
        delete: harness.calls.delete,
      },
      {
        create: [],
        move: [],
        update: [],
        delete: [],
      }
    );
  } finally {
    harness.unload();
  }
});

test("wrapping a block rolls back the new parent when the move fails", async () => {
  const harness = createHarness({
    moveBlock: async (args) => {
      harness.calls.move.push(args);
      throw new Error("move failed");
    },
  });
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ ctrlKey: true }));
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.move.length, 1);
    assert.equal(harness.calls.delete.length, 1);
    assert.equal(harness.calls.delete[0].block.uid, "newuid001");
  } finally {
    harness.unload();
  }
});

test("a failed move never deletes a parent that already contains the block", async () => {
  let pulls = 0;
  const harness = createHarness({
    pullBlock: () => ({
      ":block/uid": "123456789",
      ":block/order": pulls++,
      ":block/string": "",
      ":block/children": [],
      ":block/_children": [
        { ":block/uid": pulls === 1 ? "parent001" : "newuid001" },
      ],
    }),
    moveBlock: async (args) => {
      harness.calls.move.push(args);
      throw new Error("move result unknown");
    },
  });
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ ctrlKey: true }));
    assert.equal(harness.calls.delete.length, 0);
  } finally {
    harness.unload();
  }
});

test("a failed wrap preserves a new parent that was edited concurrently", async () => {
  const harness = createHarness({
    pullBlock: (_query, lookup) => {
      const uid = lookup?.[1];
      if (uid === "newuid001") {
        return {
          ":block/uid": uid,
          ":block/string": "keep this",
          ":block/children": [],
        };
      }
      return {
        ":block/uid": uid,
        ":block/order": 1,
        ":block/string": "original",
        ":block/children": [],
        ":block/_children": [{ ":block/uid": "parent001" }],
      };
    },
    moveBlock: async (args) => {
      harness.calls.move.push(args);
      throw new Error("move failed");
    },
  });
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ ctrlKey: true }));
    assert.equal(harness.calls.delete.length, 0);
  } finally {
    harness.unload();
  }
});

test("a failed wrap preserves a new parent that gained a child", async () => {
  const harness = createHarness({
    pullBlock: (_query, lookup) => {
      const uid = lookup?.[1];
      if (uid === "newuid001") {
        return {
          ":block/uid": uid,
          ":block/string": "",
          ":block/children": [{ ":block/uid": "child0001" }],
        };
      }
      return {
        ":block/uid": uid,
        ":block/order": 1,
        ":block/string": "original",
        ":block/children": [],
        ":block/_children": [{ ":block/uid": "parent001" }],
      };
    },
    moveBlock: async (args) => {
      harness.calls.move.push(args);
      throw new Error("move failed");
    },
  });
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ ctrlKey: true }));
    assert.equal(harness.calls.delete.length, 0);
  } finally {
    harness.unload();
  }
});

test("inserting a child expands a collapsed parent before focusing", async () => {
  const harness = createHarness({ collapsed: true });
  try {
    const button = harness.renderForContainer();
    await button.onClick(harness.event({ metaKey: true }));
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.create[0].location["parent-uid"], "123456789");
    assert.equal(harness.calls.update.length, 1);
    assert.equal(harness.calls.update[0].block.uid, "123456789");
    assert.equal(harness.calls.update[0].block.open, true);
  } finally {
    harness.unload();
  }
});

test("unloading cancels delayed focus work after an insertion", async () => {
  const harness = createHarness();
  const button = harness.renderForContainer();
  await button.onClick(harness.event());
  assert.equal(harness.pendingTimerCount(), 1);
  harness.unload();
  assert.equal(harness.pendingTimerCount(), 0);
});

test("an insertion finishing after unload never schedules focus", async () => {
  let finishCreate;
  const harness = createHarness({
    createBlock: (args) => {
      harness.calls.create.push(args);
      return new Promise((resolve) => {
        finishCreate = resolve;
      });
    },
  });
  try {
    const button = harness.renderForContainer();
    const operation = button.onClick(harness.event());
    await Promise.resolve();
    assert.equal(harness.calls.create.length, 1);

    harness.unload();
    finishCreate();
    await operation;

    assert.equal(harness.pendingTimerCount(), 0);
  } finally {
    harness.unload();
  }
});

test("unloading removes the button without the legacy React unmount API", () => {
  const harness = createHarness({ unmountAvailable: false });
  harness.renderForContainer();
  assert.equal(harness.buttonExists(), true);
  harness.unload();
  assert.equal(harness.buttonExists(), false);
});
