const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class ClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }

  add(name) {
    this.classes.add(name);
  }

  contains(name) {
    return this.classes.has(name);
  }

  toggle(name, force) {
    if (force) this.classes.add(name);
    else this.classes.delete(name);
  }
}

const createHarness = ({
  collapsed = false,
  deleteBlock,
  moveBlock,
  pullBlock,
  unmountAvailable = true,
} = {}) => {
  const listeners = new Map();
  const calls = { create: [], move: [], update: [], delete: [] };
  const errors = [];
  let styleElement = null;
  let buttonContainer = null;
  let renderedIcon = null;
  let nextUid = 0;
  let nextTimerId = 0;
  const pendingTimers = new Set();

  const makeElement = (tagName) => ({
    tagName,
    id: "",
    innerHTML: "",
    style: {},
    classList: new ClassList(),
    getBoundingClientRect: () => ({ top: 0, height: 24 }),
    remove() {
      if (this === styleElement) styleElement = null;
      if (this === buttonContainer) buttonContainer = null;
    },
  });

  const documentElement = {
    addEventListener(type, handler) {
      listeners.set(`root:${type}`, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(`root:${type}`) === handler) listeners.delete(`root:${type}`);
    },
  };

  const documentMock = {
    documentElement,
    head: { appendChild: (element) => (styleElement = element) },
    createElement: makeElement,
    getElementById(id) {
      if (styleElement?.id === id) return styleElement;
      if (buttonContainer?.id === id) return buttonContainer;
      return null;
    },
    querySelector: () => null,
    addEventListener(type, handler) {
      listeners.set(`document:${type}`, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(`document:${type}`) === handler) {
        listeners.delete(`document:${type}`);
      }
    },
  };

  const api = {
    data: {
      pull:
        pullBlock ||
        (() => ({
          ":block/order": 1,
          ":block/children": [],
          ":block/_children": [{ ":block/uid": "parent001" }],
        })),
    },
    ui: { getFocusedBlock: () => ({ "window-id": "main" }) },
    util: { generateUID: () => `newuid00${++nextUid}` },
    createBlock: async (args) => calls.create.push(args),
    moveBlock: moveBlock || (async (args) => calls.move.push(args)),
    updateBlock: async (args) => calls.update.push(args),
    deleteBlock: deleteBlock || (async (args) => calls.delete.push(args)),
  };

  const reactDOM = {
    render(element) {
      renderedIcon = element;
    },
  };
  if (unmountAvailable) {
    reactDOM.unmountComponentAtNode = () => {
      renderedIcon = null;
    };
  }

  const windowMock = {
    roamAlphaAPI: api,
    React: { createElement: (_component, props) => ({ props }) },
    ReactDOM: reactDOM,
    Blueprint: { Core: { Icon: function Icon() {} } },
    getComputedStyle: () => ({ top: "2px" }),
  };

  class MutationObserverMock {
    observe() {}
    disconnect() {}
  }

  const moduleSource = fs
    .readFileSync("extension.js", "utf8")
    .replace("export default {", "window.__extension = {");
  vm.runInNewContext(moduleSource, {
    console: { ...console, error: (...args) => errors.push(args) },
    document: documentMock,
    window: windowMock,
    HTMLElement: function HTMLElement() {},
    MutationObserver: MutationObserverMock,
    requestAnimationFrame: (callback) => callback(),
    setTimeout: () => {
      const id = ++nextTimerId;
      pendingTimers.add(id);
      return id;
    },
    clearTimeout: (id) => pendingTimers.delete(id),
  });

  const bullet = {
    classList: new ClassList(collapsed ? ["rm-bullet--closed"] : []),
  };
  const container = {
    classList: new ClassList(),
    querySelector(selector) {
      if (selector.startsWith("[id^='block-input']")) {
        return { id: "block-input-main-123456789" };
      }
      if (selector === ".rm-bullet") return bullet;
      return null;
    },
    closest: () => null,
    appendChild(element) {
      buttonContainer = element;
    },
    contains: () => false,
    getBoundingClientRect: () => ({ top: 0, height: 24 }),
  };

  const renderForContainer = () => {
    windowMock.__extension.onload();
    listeners.get("document:pointermove")({
      target: { closest: () => container },
    });
    return renderedIcon.props;
  };

  const event = (overrides = {}) => ({
    preventDefault() {},
    stopPropagation() {},
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  });

  return {
    calls,
    buttonExists: () => Boolean(buttonContainer),
    errors,
    event,
    pendingTimerCount: () => pendingTimers.size,
    renderForContainer,
    unload: () => windowMock.__extension.onunload(),
  };
};

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
      ":block/order": pulls++,
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

test("unloading removes the button without the legacy React unmount API", () => {
  const harness = createHarness({ unmountAvailable: false });
  harness.renderForContainer();
  assert.equal(harness.buttonExists(), true);
  harness.unload();
  assert.equal(harness.buttonExists(), false);
});
