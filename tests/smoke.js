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

const makeElement = (tagName) => ({
  tagName,
  id: "",
  innerHTML: "",
  style: {},
  classList: new ClassList(),
  getBoundingClientRect: () => ({ top: 0, height: 24 }),
  remove() {
    if (this === styleElement) styleElement = null;
    if (this === buttonElement) buttonElement = null;
  },
});

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
  documentMode,
  hasChildren,
  containerTop = 100,
  bulletTop = 114,
  bulletHeight = 8,
  caretTop = null,
  caretHeight = 10,
}) => {
  const rect = (top, height) => ({ top, bottom: top + height, height });
  const bulletInner = {
    getBoundingClientRect: () => rect(bulletTop, bulletHeight),
  };
  const bullet = {
    classList: new ClassList(),
    querySelector(selector) {
      return selector === ".rm-bullet__inner" ? bulletInner : null;
    },
    getBoundingClientRect: () => rect(bulletTop, bulletHeight),
  };
  const caret =
    caretTop === null
      ? null
      : {
          classList: new ClassList(),
          querySelector: () => null,
          getBoundingClientRect: () => rect(caretTop, caretHeight),
        };
  const controls = {
    querySelector(selector) {
      if (selector === ".rm-bullet") return bullet;
      if (selector === ".rm-caret" || selector === ".block-expand") {
        return caret;
      }
      return null;
    },
  };
  const blockMain = {
    querySelector(selector) {
      return selector === ".rm-block__controls" ? controls : null;
    },
  };
  const input = {
    id: "block-input-main-123456789",
    closest(selector) {
      return selector === ".rm-block-main" ? blockMain : null;
    },
    getBoundingClientRect: () => rect(bulletTop, bulletHeight),
  };
  const children = [bullet];
  const container = {
    children,
    nativeBullet: bullet,
    classList: new ClassList(),
    querySelector(selector) {
      if (selector.startsWith("[id^='block-input']")) return input;
      if (selector === ".rm-block-children") {
        return hasChildren ? {} : null;
      }
      if (selector === ".roam-block-container") {
        return hasChildren ? {} : null;
      }
      if (selector === ".rm-block__controls") return controls;
      if (selector === ".rm-bullet") return bullet;
      return null;
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
      children.push(element);
      buttonElement = element;
    },
    contains() {
      return false;
    },
    getBoundingClientRect() {
      return rect(containerTop, 24);
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
  getComputedStyle: () => ({ top: "2px" }),
};

class MutationObserverMock {
  observe() {}
  disconnect() {}
}

const moduleSource = fs
  .readFileSync("extension.js", "utf8")
  .replace("export default {", "window.__extension = {");

const context = {
  console,
  document: documentMock,
  window: windowMock,
  HTMLElement: function HTMLElement() {},
  MutationObserver: MutationObserverMock,
  requestAnimationFrame: (callback) => callback(),
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

const pointerMove = listeners.get("document:pointermove");
const moveOver = (container) =>
  pointerMove({
    target: {
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
    },
  });

const outlineContainer = createContainer({
  documentMode: false,
  hasChildren: true,
  caretTop: 102,
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
assert.strictEqual(
  buttonElement.style.top,
  "18px",
  "an outline caret must keep a measured gap above the insert control"
);

const plainContainer = createContainer({
  documentMode: false,
  hasChildren: false,
});
moveOver(plainContainer);
assert.strictEqual(
  buttonElement.style.top,
  "6px",
  "a plain block must center the insert control on its own bullet"
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
