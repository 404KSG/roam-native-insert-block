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
  platform = "MacIntel",
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

  const makeElement = (tagName) => {
    const eventHandlers = new Map();
    const element = {
      tagName: tagName.toUpperCase(),
      id: "",
      innerHTML: "",
      textContent: "",
      className: "",
      role: "",
      style: {},
      children: [],
      parentNode: null,
      classList: new ClassList(),
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      addEventListener(type, handler) {
        eventHandlers.set(type, handler);
      },
      removeEventListener(type, handler) {
        if (eventHandlers.get(type) === handler) eventHandlers.delete(type);
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      closest(selector) {
        if (selector.startsWith("#") && this.id === selector.slice(1)) return this;
        if (
          selector.startsWith(".") &&
          this.className.split(/\s+/).includes(selector.slice(1))
        ) {
          return this;
        }
        return this.parentNode?.closest?.(selector) || null;
      },
      getBoundingClientRect: () => ({
        top: 0,
        left: 0,
        right: 180,
        bottom: 200,
        width: 180,
        height: 200,
      }),
      async click() {
        return eventHandlers.get("click")?.({
          preventDefault() {},
          stopPropagation() {},
          target: this,
        });
      },
      remove() {
        if (this === styleElement) styleElement = null;
        if (this === buttonContainer) buttonContainer = null;
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter(
            (child) => child !== this
          );
          this.parentNode = null;
        }
      },
    };
    return element;
  };

  const body = makeElement("body");

  const findById = (root, id) => {
    if (root.id === id) return root;
    for (const child of root.children || []) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  };

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
    body,
    head: { appendChild: (element) => (styleElement = element) },
    createElement: makeElement,
    getElementById(id) {
      if (styleElement?.id === id) return styleElement;
      if (buttonContainer?.id === id) return buttonContainer;
      return findById(body, id);
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
    navigator: { platform },
    React: {
      createElement: (component, props, ...children) => ({
        component,
        props: props || {},
        children,
      }),
    },
    ReactDOM: reactDOM,
    Blueprint: {
      Core: {
        Button: function Button() {},
        Icon: function Icon() {},
        Tooltip: function Tooltip() {},
      },
    },
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

  const findInteractiveTrigger = (node) => {
    if (!node || typeof node !== "object") return null;
    if (typeof node.props?.onClick === "function") return node;
    for (const child of node.children || []) {
      const found = findInteractiveTrigger(child);
      if (found) return found;
    }
    return null;
  };

  const renderForContainer = () => {
    windowMock.__extension.onload();
    listeners.get("document:pointermove")({
      target: { closest: () => container },
    });
    return findInteractiveTrigger(renderedIcon).props;
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
    fireDocumentEvent: (type, overrides = {}) =>
      listeners.get(`document:${type}`)?.(
        event({ key: "", target: { id: "" }, ...overrides })
      ),
    menu: () => body.children.find((child) => child.role === "menu") || null,
    pendingTimerCount: () => pendingTimers.size,
    rendered: () => renderedIcon,
    renderForContainer,
    trigger: () => findInteractiveTrigger(renderedIcon)?.props || null,
    unload: () => windowMock.__extension.onunload(),
  };
};

test("the trigger is a Blueprint button with a discoverable macOS tooltip", () => {
  const harness = createHarness();
  try {
    harness.renderForContainer();
    const tooltip = harness.rendered();
    const button = tooltip.children[0];

    assert.equal(tooltip.component.name, "Tooltip");
    assert.equal(tooltip.props.hoverOpenDelay, 400);
    assert.equal(
      tooltip.props.content,
      "Click: below · ⌘ child · ⌥ above · ⌃ parent · ⇧ delete"
    );
    assert.equal(button.component.name, "Button");
    assert.equal(button.props["aria-label"], "Insert block below");
    assert.equal(button.props.minimal, true);
  } finally {
    harness.unload();
  }
});

test("Windows uses Ctrl for child and Ctrl+Alt for parent", async () => {
  const childHarness = createHarness({ platform: "Win32" });
  try {
    childHarness.renderForContainer();
    assert.equal(
      childHarness.rendered().props.content,
      "Click: below · Ctrl child · Alt above · Ctrl+Alt parent · Shift delete"
    );
    await childHarness.trigger().onClick(childHarness.event({ ctrlKey: true }));
    assert.equal(
      childHarness.calls.create[0].location["parent-uid"],
      "123456789"
    );
  } finally {
    childHarness.unload();
  }

  const parentHarness = createHarness({ platform: "Linux x86_64" });
  try {
    parentHarness.renderForContainer();
    await parentHarness
      .trigger()
      .onClick(parentHarness.event({ ctrlKey: true, altKey: true }));
    assert.equal(parentHarness.calls.move.length, 1);
    assert.equal(
      parentHarness.calls.move[0].location["parent-uid"],
      "newuid001"
    );
  } finally {
    parentHarness.unload();
  }
});

test("holding a modifier previews its action icon and releasing restores below", () => {
  const harness = createHarness();
  try {
    harness.renderForContainer();
    assert.equal(harness.trigger().icon, "plus");

    harness.fireDocumentEvent("keydown", { key: "Shift", shiftKey: true });
    assert.equal(harness.trigger().icon, "trash");
    assert.equal(harness.trigger()["aria-label"], "Delete block");

    harness.fireDocumentEvent("keyup", { key: "Shift" });
    assert.equal(harness.trigger().icon, "plus");
    assert.equal(harness.trigger()["aria-label"], "Insert block below");
  } finally {
    harness.unload();
  }
});

test("right-click opens five Blueprint-style actions with a separated delete", () => {
  const harness = createHarness();
  try {
    const trigger = harness.renderForContainer();
    trigger.onContextMenu(
      harness.event({ clientX: 120, clientY: 80, type: "contextmenu" })
    );

    const menu = harness.menu();
    assert.ok(menu, "the action menu should be visible");
    assert.equal(menu.className.includes("bp3-menu"), true);
    assert.deepEqual(
      menu.children.map((item) => item.textContent),
      [
        "Insert Above",
        "Insert Below",
        "Insert Child",
        "Wrap in Parent",
        "Delete Block",
      ]
    );
    assert.equal(
      menu.children[4].className.includes("native-insert-block-menu-delete"),
      true
    );
  } finally {
    harness.unload();
  }
});

test("choosing Insert Above from the menu creates the block before its target", async () => {
  const harness = createHarness();
  try {
    const trigger = harness.renderForContainer();
    trigger.onContextMenu(
      harness.event({ clientX: 120, clientY: 80, type: "contextmenu" })
    );

    await harness.menu().children[0].click();

    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.create[0].location["parent-uid"], "parent001");
    assert.equal(harness.calls.create[0].location.order, 1);
    assert.equal(harness.menu(), null);
  } finally {
    harness.unload();
  }
});

test("the menu is accessible and closes on Escape, outside click, and scroll", () => {
  const harness = createHarness();
  try {
    const trigger = harness.renderForContainer();
    const openMenu = () =>
      trigger.onContextMenu(
        harness.event({ clientX: 120, clientY: 80, type: "contextmenu" })
      );

    openMenu();
    assert.equal(harness.menu()["aria-label"], "Block actions");
    assert.equal(
      harness.menu().children.every((item) => item.role === "menuitem"),
      true
    );

    harness.fireDocumentEvent("keydown", { key: "Escape" });
    assert.equal(harness.menu(), null);

    openMenu();
    harness.fireDocumentEvent("pointerdown", {
      target: { id: "", closest: () => null },
    });
    assert.equal(harness.menu(), null);

    openMenu();
    harness.fireDocumentEvent("scroll");
    assert.equal(harness.menu(), null);
  } finally {
    harness.unload();
  }
});

test("unloading removes an open action menu", () => {
  const harness = createHarness();
  const trigger = harness.renderForContainer();
  trigger.onContextMenu(
    harness.event({ clientX: 120, clientY: 80, type: "contextmenu" })
  );
  assert.ok(harness.menu());
  harness.unload();
  assert.equal(harness.menu(), null);
});

test("the action menu stays open while the pointer moves into it", () => {
  const harness = createHarness();
  try {
    const trigger = harness.renderForContainer();
    trigger.onContextMenu(
      harness.event({ clientX: 120, clientY: 80, type: "contextmenu" })
    );
    const menu = harness.menu();

    harness.fireDocumentEvent("pointermove", { target: menu });

    assert.equal(harness.menu(), menu);
  } finally {
    harness.unload();
  }
});

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
