const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

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
    return force;
  }
}

const listeners = new Map();
const documentListeners = {
  addEventListener(type, handler) {
    listeners.set(`document:${type}`, handler);
  },
  removeEventListener(type, handler) {
    if (listeners.get(`document:${type}`) === handler) {
      listeners.delete(`document:${type}`);
    }
  },
};

const documentElement = {
  addEventListener(type, handler) {
    listeners.set(`root:${type}`, handler);
  },
  removeEventListener(type, handler) {
    if (listeners.get(`root:${type}`) === handler) {
      listeners.delete(`root:${type}`);
    }
  },
};

let styleElement = null;
let buttonElement = null;

const createRect = (top = 0, height = 24) => ({ top, height });

const makeElement = (tagName) => {
  const element = {
    tagName,
    id: "",
    innerHTML: "",
    style: {},
    classList: new ClassList(),
    rect: createRect(),
    computedStyle: {},
    getBoundingClientRect() {
      return { ...this.rect };
    },
    remove() {
      if (this === styleElement) styleElement = null;
      if (this === buttonElement) buttonElement = null;
    },
  };
  return element;
};

const documentMock = {
  ...documentListeners,
  documentElement,
  head: {
    appendChild(element) {
      styleElement = element;
    },
  },
  createElement: makeElement,
  getElementById(id) {
    if (styleElement?.id === id) return styleElement;
    if (buttonElement?.id === id) return buttonElement;
    return null;
  },
  querySelector() {
    return null;
  },
};

const createContainer = ({
  documentMode = false,
  hasChildren = false,
  collapsed = false,
  containerRect = createRect(0, 24),
  bulletRect = createRect(6, 12),
  buttonRect = createRect(0, 24),
  bulletVisible = true,
  includeBullet = true,
  nestedBulletRect = null,
  bulletOrder = "own-first",
} = {}) => {
  const input = { id: "block-input-main-123456789" };
  let currentBulletRect = { ...bulletRect };
  const geometryReads = { bullet: 0, container: 0 };
  const visualBullet = {
    computedStyle: {
      display: bulletVisible ? "block" : "none",
      visibility: bulletVisible ? "visible" : "hidden",
    },
    getBoundingClientRect: () => {
      geometryReads.bullet += 1;
      return { ...currentBulletRect };
    },
  };
  let container;
  const bullet = {
    classList: new ClassList(collapsed ? ["rm-bullet--closed"] : []),
    closest(selector) {
      return selector === ".roam-block-container" ? container : null;
    },
    querySelector(selector) {
      return selector === ".rm-bullet__inner" ? visualBullet : null;
    },
  };
  const nestedContainer = {};
  const nestedVisualBullet = nestedBulletRect
    ? {
        computedStyle: { display: "block", visibility: "visible" },
        getBoundingClientRect: () => ({ ...nestedBulletRect }),
      }
    : null;
  const nestedBullet = nestedVisualBullet
    ? {
        classList: new ClassList(),
        closest(selector) {
          return selector === ".roam-block-container"
            ? nestedContainer
            : null;
        },
        querySelector(selector) {
          return selector === ".rm-bullet__inner" ? nestedVisualBullet : null;
        },
      }
    : null;
  const bullets = includeBullet
    ? bulletOrder === "nested-first" && nestedBullet
      ? [nestedBullet, bullet]
      : nestedBullet
        ? [bullet, nestedBullet]
        : [bullet]
    : [];
  const children = includeBullet ? [bullet] : [];
  container = {
    children,
    nativeBullet: bullet,
    classList: new ClassList(),
    querySelector(selector) {
      if (selector.startsWith("[id^='block-input']")) return input;
      if (selector === ".rm-block-children") {
        return hasChildren ? {} : null;
      }
      if (selector === ".roam-block-container") {
        return hasChildren ? nestedContainer : null;
      }
      if (selector === ".rm-bullet") return includeBullet ? bullet : null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".rm-bullet" ? bullets : [];
    },
    closest(selector) {
      if (
        selector ===
        ".rm-block--document, .rm-block__children--document"
      ) {
        return documentMode ? container : null;
      }
      return null;
    },
    appendChild(element) {
      element.rect = { ...buttonRect };
      children.push(element);
      buttonElement = element;
    },
    contains() {
      return false;
    },
    getBoundingClientRect() {
      geometryReads.container += 1;
      return { ...containerRect };
    },
    setBulletRect(nextRect) {
      currentBulletRect = { ...nextRect };
    },
    getGeometryReads() {
      return { ...geometryReads };
    },
  };
  return container;
};

const windowMock = {
  React: {
    createElement(component, props) {
      return { component, props };
    },
  },
  ReactDOM: {
    render() {},
    unmountComponentAtNode() {},
  },
  Blueprint: { Core: { Icon: function Icon() {} } },
  roamAlphaAPI: {
    ui: { getFocusedBlock: () => null },
    util: { generateUID: () => "987654321" },
  },
  getComputedStyle: (element) => ({
    top: "2px",
    ...element?.computedStyle,
  }),
};

class MutationObserverMock {
  observe() {}
  disconnect() {}
}

const moduleSource = fs
  .readFileSync("extension.js", "utf8")
  .replace("export default {", "window.__extension = {");

let nextAnimationFrameId = 0;
const animationFrames = new Map();
const flushAnimationFrames = () => {
  const callbacks = [...animationFrames.values()];
  animationFrames.clear();
  for (const callback of callbacks) callback();
};

const context = {
  console,
  document: documentMock,
  window: windowMock,
  HTMLElement: function HTMLElement() {},
  MutationObserver: MutationObserverMock,
  requestAnimationFrame: (callback) => {
    const id = ++nextAnimationFrameId;
    animationFrames.set(id, callback);
    return id;
  },
  cancelAnimationFrame: (id) => animationFrames.delete(id),
  setTimeout,
  clearTimeout,
};

vm.runInNewContext(moduleSource, context);

assert.strictEqual(listeners.size, 0, "import must not register listeners");
assert.strictEqual(styleElement, null, "import must not add styles");
assert.strictEqual(
  windowMock.nativeInsertBlockPlugin,
  undefined,
  "import must not start the plugin"
);

windowMock.__extension.onload();
assert.strictEqual(listeners.size, 6, "onload must register all listeners");
assert.ok(styleElement, "onload must add styles");
assert.ok(
  styleElement.innerHTML.includes(
    "#native-insert-block-btn-container.native-insert-block-document-mode { top: 1px; }"
  ),
  "document mode must optically align the plus icon with the row handle"
);
assert.ok(
  styleElement.innerHTML.includes(
    "#native-insert-block-btn-container.native-insert-block-no-children { top: 2px; }"
  ),
  "CSS top values must remain fallback-only defaults"
);
assert.ok(
  !styleElement.innerHTML.includes(
    "translateY(1.125px)"
  ),
  "the plugin must not encode a one-theme pixel correction"
);

const pointerMove = listeners.get("document:pointermove");
const moveOver = (container) =>
  pointerMove({
    target: {
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
    },
  });

const nextSibling = {
  getBoundingClientRect: () => createRect(480.625, 24),
};
const siblingBefore = nextSibling.getBoundingClientRect();
moveOver(
  createContainer({
    containerRect: createRect(100.5, 30),
    bulletRect: createRect(121.625, 11.25),
  })
);
assert.strictEqual(
  buttonElement.style.top,
  "14.75px",
  "fractional Bullet geometry must anchor the plus relative to its container"
);
assert.deepStrictEqual(
  nextSibling.getBoundingClientRect(),
  siblingBefore,
  "absolute plus positioning must not change adjacent Block flow"
);

const sameContainer = createContainer({
  containerRect: createRect(160, 30),
  bulletRect: createRect(180, 12),
});
moveOver(sameContainer);
const geometryAfterFirstMove = sameContainer.getGeometryReads();
moveOver(sameContainer);
assert.deepStrictEqual(
  sameContainer.getGeometryReads(),
  geometryAfterFirstMove,
  "repeated pointer movement over the active Block must not remeasure geometry"
);

moveOver(
  createContainer({
    containerRect: createRect(200, 30),
    bulletRect: createRect(215, 10),
    nestedBulletRect: createRect(400, 10),
    bulletOrder: "nested-first",
  })
);
assert.strictEqual(
  buttonElement.style.top,
  "8px",
  "nested descendant Bullets must never become the current Block anchor"
);

moveOver(
  createContainer({
    containerRect: createRect(-180.5, 30),
    bulletRect: createRect(-160.25, 11),
  })
);
assert.strictEqual(
  buttonElement.style.top,
  "13.75px",
  "container-relative geometry must remain stable in a scrolled sidebar"
);

const expandedParent = createContainer({
  hasChildren: true,
  containerRect: createRect(360, 30),
  bulletRect: createRect(380, 12),
});
moveOver(expandedParent);
assert.strictEqual(
  buttonElement.style.top,
  "",
  "a parent with visible children must retain its CSS caret-clearance placement"
);
assert.deepStrictEqual(
  expandedParent.getGeometryReads(),
  { bullet: 0, container: 0 },
  "a parent with children must not measure itself as a leaf Bullet anchor"
);

const collapsedParent = createContainer({
  hasChildren: true,
  collapsed: true,
  containerRect: createRect(400, 30),
  bulletRect: createRect(420, 12),
});
moveOver(collapsedParent);
assert.strictEqual(
  buttonElement.style.top,
  "",
  "a collapsed parent must retain its CSS child placement instead of overlapping the native caret"
);
assert.deepStrictEqual(
  collapsedParent.getGeometryReads(),
  { bullet: 0, container: 0 },
  "a parent with a native caret must not measure itself as a leaf Bullet anchor"
);

moveOver(
  createContainer({
    documentMode: true,
    bulletVisible: false,
    containerRect: createRect(100, 30),
    bulletRect: createRect(120, 12),
  })
);
assert.strictEqual(
  buttonElement.style.top,
  "",
  "Document Mode must retain its CSS fallback until a visible anchor exists"
);

const retryContainer = createContainer({
  containerRect: createRect(100, 30),
  bulletRect: createRect(120, 0),
});
moveOver(retryContainer);
assert.strictEqual(
  animationFrames.size,
  1,
  "zero-height geometry must schedule one retry frame"
);
retryContainer.setBulletRect(createRect(120, 12));
flushAnimationFrames();
assert.strictEqual(
  buttonElement.style.top,
  "14px",
  "the single retry must apply the recovered Bullet geometry"
);
assert.strictEqual(
  animationFrames.size,
  0,
  "a successful retry must leave no pending positioning frame"
);

const unavailableContainer = createContainer({
  containerRect: createRect(100, 30),
  bulletRect: createRect(120, 0),
});
moveOver(unavailableContainer);
assert.strictEqual(
  animationFrames.size,
  1,
  "an unavailable geometry state gets only its one retry"
);
flushAnimationFrames();
assert.strictEqual(
  buttonElement.style.top,
  "",
  "a persistently unavailable Bullet must fall back to CSS positioning"
);
assert.strictEqual(
  animationFrames.size,
  0,
  "a failed retry must not schedule a second frame"
);

const outlineContainer = createContainer({
  documentMode: false,
  hasChildren: true,
});
moveOver(outlineContainer);
assert.ok(buttonElement, "outline mode must render the insert button");
assert.ok(
  outlineContainer.children.includes(outlineContainer.nativeBullet),
  "rendering the insert control must preserve Roam's native bullet"
);
assert.strictEqual(
  buttonElement.classList.contains("native-insert-block-document-mode"),
  false,
  "outline mode must not use document positioning"
);
assert.strictEqual(
  buttonElement.classList.contains("native-insert-block-no-children"),
  false,
  "outline blocks with children must preserve caret clearance"
);

moveOver(createContainer({ documentMode: true, hasChildren: true }));
assert.ok(buttonElement, "document mode must render the insert button");
assert.ok(
  buttonElement.classList.contains("native-insert-block-document-mode"),
  "document mode must use inline positioning"
);
assert.ok(
  buttonElement.classList.contains("native-insert-block-no-children"),
  "document blocks with children must stay aligned to the text row"
);

windowMock.__extension.onunload();
assert.strictEqual(listeners.size, 0, "onunload must remove all listeners");
assert.strictEqual(styleElement, null, "onunload must remove styles");
assert.strictEqual(buttonElement, null, "onunload must remove the button");
assert.strictEqual(
  windowMock.nativeInsertBlockPlugin,
  undefined,
  "onunload must remove the global plugin instance"
);

const roamjsSource = fs.readFileSync("roamjs.js", "utf8");
const runManualBundle = () =>
  vm.runInNewContext(roamjsSource, {
    ...context,
    document: documentMock,
    window: windowMock,
  });

runManualBundle();
assert.strictEqual(
  listeners.size,
  6,
  "manual roam/js bundle must start itself"
);
assert.ok(
  windowMock.nativeInsertBlockPlugin,
  "manual roam/js bundle must register its runtime owner"
);

const firstManualRuntime = windowMock.nativeInsertBlockPlugin;
runManualBundle();
assert.notStrictEqual(
  windowMock.nativeInsertBlockPlugin,
  firstManualRuntime,
  "reloading the manual bundle must replace the previous runtime"
);
assert.strictEqual(
  listeners.size,
  6,
  "reloading the manual bundle must not duplicate listeners"
);

windowMock.nativeInsertBlockPlugin.destroy();
delete windowMock.nativeInsertBlockPlugin;
assert.strictEqual(listeners.size, 0, "manual runtime must clean up listeners");
assert.strictEqual(styleElement, null, "manual runtime must remove styles");

console.log("Native Insert Block smoke test: PASS");
