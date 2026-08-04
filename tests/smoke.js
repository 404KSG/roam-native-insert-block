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

const createContainer = ({ documentMode, hasChildren }) => {
  const input = { id: "block-input-main-123456789" };
  const bullet = { classList: new ClassList() };
  const container = {
    classList: new ClassList(),
    querySelector(selector) {
      if (selector.startsWith("[id^='block-input']")) return input;
      if (selector === ".rm-block-children") {
        return hasChildren ? {} : null;
      }
      if (selector === ".roam-block-container") {
        return hasChildren ? {} : null;
      }
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
      buttonElement = element;
    },
    contains() {
      return false;
    },
    getBoundingClientRect() {
      return { top: 0, height: 24 };
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

const pointerMove = listeners.get("document:pointermove");
const moveOver = (container) =>
  pointerMove({
    target: {
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
    },
  });

moveOver(createContainer({ documentMode: false, hasChildren: true }));
assert.ok(buttonElement, "outline mode must render the insert button");
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

console.log("Native Insert Block smoke test: PASS");
