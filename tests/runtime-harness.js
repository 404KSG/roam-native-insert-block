const fs = require("node:fs");
const path = require("node:path");
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

const clone = (value) => JSON.parse(JSON.stringify(value));

const defaultBlock = (uid) => ({
  ":block/uid": uid,
  ":block/order": 1,
  ":block/string": "",
  ":block/children": [],
  ":block/_children": [{ ":block/uid": "parent001" }],
});

const DEFAULT_INPUT_ID = "block-input-main-123456789";
const DEFAULT_BLOCK_UID = "123456789";

const createRuntime = ({
  inputId = DEFAULT_INPUT_ID,
  blockUid = inputId === DEFAULT_INPUT_ID ? DEFAULT_BLOCK_UID : null,
  dataUid = null,
  inputDataBlockUid = null,
  containerDataUid = null,
  nested = [],
  skipOwnInput = false,
  collapsed = false,
  connected = true,
  inputTagName = "DIV",
  graph = null,
  focusedBlock = { "window-id": "main", "block-uid": "focusedxxx" },
  createBlock,
  deleteBlock,
  moveBlock,
  updateBlock,
  pullBlock,
  setBlockFocusAndSelection,
  unmountAvailable = true,
  extraInputs = [],
} = {}) => {
  const listeners = new Map();
  const calls = {
    create: [],
    move: [],
    update: [],
    delete: [],
    pull: [],
    focus: [],
    querySelector: [],
    getElementById: [],
  };
  const errors = [];
  let styleElement = null;
  let buttonContainer = null;
  let statusElement = null;
  let renderedIcon = null;
  let nextUid = 0;
  let nextTimerId = 0;
  let nextFrameId = 0;
  const pendingTimers = new Map();
  const animationFrames = new Map();
  const nodesById = new Map();

  const blockGraph = new Map();
  if (graph) {
    for (const [uid, data] of Object.entries(graph)) {
      blockGraph.set(uid, clone(data));
    }
  }

  const makeElement = (tagName) => ({
    tagName,
    id: "",
    innerHTML: "",
    textContent: "",
    style: {},
    classList: new ClassList(),
    attributes: {},
    isConnected: true,
    getAttribute(name) {
      if (name === "id") return this.id;
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getBoundingClientRect: () => ({ top: 0, height: 24 }),
    remove() {
      this.isConnected = false;
      if (this === styleElement) styleElement = null;
      if (this === buttonContainer) buttonContainer = null;
      if (this === statusElement) statusElement = null;
      if (this.id) nodesById.delete(this.id);
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

  const body = {
    children: [],
    appendChild(element) {
      this.children.push(element);
      if (element?.id) nodesById.set(element.id, element);
      if (element?.id === "native-insert-block-status") statusElement = element;
      return element;
    },
  };

  const getById = (id) => {
    calls.getElementById.push(id);
    if (styleElement?.id === id) return styleElement;
    if (buttonContainer?.id === id) return buttonContainer;
    if (statusElement?.id === id) return statusElement;
    if (nodesById.has(id)) return nodesById.get(id);
    return null;
  };

  const documentMock = {
    documentElement,
    body,
    head: {
      appendChild(element) {
        styleElement = element;
        if (element?.id) nodesById.set(element.id, element);
        return element;
      },
    },
    createElement: makeElement,
    getElementById: getById,
    contains(node) {
      return Boolean(node) && node.isConnected !== false;
    },
    querySelector(selector) {
      calls.querySelector.push(selector);
      if (typeof selector === "string" && selector.startsWith("#")) {
        return getById(selector.slice(1));
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      listeners.set(`document:${type}`, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(`document:${type}`) === handler) {
        listeners.delete(`document:${type}`);
      }
    },
  };

  const pullFromGraph = (query, lookup) => {
    const uid = lookup?.[1];
    calls.pull.push({ query, uid });
    if (!uid || !blockGraph.has(uid)) return null;
    return clone(blockGraph.get(uid));
  };

  const api = {
    data: {
      pull:
        pullBlock ||
        (graph
          ? pullFromGraph
          : (query, lookup) => {
              const uid = lookup?.[1];
              calls.pull.push({ query, uid });
              return defaultBlock(uid || "123456789");
            }),
    },
    ui: {
      getFocusedBlock: () => focusedBlock,
      setBlockFocusAndSelection:
        setBlockFocusAndSelection ||
        ((args) => {
          calls.focus.push(clone(args));
        }),
    },
    util: { generateUID: () => `newuid00${++nextUid}` },
    createBlock:
      createBlock ||
      (async (args) => {
        calls.create.push(clone(args));
        const uid = args?.block?.uid;
        if (uid && graph) {
          blockGraph.set(uid, {
            ":block/uid": uid,
            ":block/order": args?.location?.order ?? 0,
            ":block/string": args?.block?.string ?? "",
            ":block/children": [],
            ":block/_children": [
              { ":block/uid": args?.location?.["parent-uid"] },
            ],
          });
        }
      }),
    moveBlock:
      moveBlock ||
      (async (args) => {
        calls.move.push(clone(args));
      }),
    updateBlock:
      updateBlock ||
      (async (args) => {
        calls.update.push(clone(args));
      }),
    deleteBlock:
      deleteBlock ||
      (async (args) => {
        calls.delete.push(clone(args));
        const uid = args?.block?.uid;
        if (uid && graph) blockGraph.delete(uid);
      }),
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
    alert() {
      throw new Error("window.alert must not be used");
    },
    confirm() {
      throw new Error("window.confirm must not be used");
    },
  };

  class MutationObserverMock {
    observe() {}
    disconnect() {}
  }

  const moduleSource = fs
    .readFileSync("extension.js", "utf8")
    .replace("export default {", "window.__extension = {");

  vm.runInNewContext(
    moduleSource,
    {
      console: { ...console, error: (...args) => errors.push(args) },
      document: documentMock,
      window: windowMock,
      HTMLElement: function HTMLElement() {},
      MutationObserver: MutationObserverMock,
      requestAnimationFrame: (callback) => {
        const id = ++nextFrameId;
        animationFrames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id) => animationFrames.delete(id),
      setTimeout: (callback, delay) => {
        const id = ++nextTimerId;
        pendingTimers.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => pendingTimers.delete(id),
    },
    { filename: path.resolve("extension.js") }
  );

  const createBlockContainer = ({
    inputId: blockInputId,
    blockUid: nativeBlockUid = null,
    dataUid: blockDataUid = null,
    inputDataBlockUid = null,
    containerDataUid: blockContainerUid = null,
    nested: nestedSpecs = [],
    skipOwnInput: skipInput = false,
    collapsed: isCollapsed = false,
    connected: isConnected = true,
    inputTagName: tagName = "DIV",
  }) => {
    let container;
    const inputAttributes = {};
    if (blockDataUid) inputAttributes["data-uid"] = blockDataUid;
    if (inputDataBlockUid) inputAttributes["data-block-uid"] = inputDataBlockUid;
    const input = skipInput
      ? null
      : {
          tagName,
          id: blockInputId,
          classList: new ClassList([
            "rm-block__input",
            "rm-block__input--view",
            "roam-block",
            "rm-block-text",
          ]),
          attributes: inputAttributes,
          getAttribute(name) {
            if (name === "id") return this.id;
            return this.attributes[name] ?? null;
          },
          closest(selector) {
            return selector === ".roam-block-container" ? container : null;
          },
        };
    const bullet = {
      classList: new ClassList(isCollapsed ? ["rm-bullet--closed"] : []),
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
      querySelector(selector) {
        return selector === ".rm-bullet__inner" ? { classList: new ClassList() } : null;
      },
    };
    const nestedContainers = nestedSpecs.map((spec) =>
      createBlockContainer({
        inputId: spec.inputId,
        blockUid: spec.blockUid,
        dataUid: spec.dataUid,
        inputDataBlockUid: spec.inputDataBlockUid,
        containerDataUid: spec.containerDataUid,
        nested: spec.nested || [],
        skipOwnInput: spec.skipOwnInput,
        collapsed: spec.collapsed,
        connected: spec.connected,
        inputTagName: spec.inputTagName,
      })
    );

    const containerAttributes = {};
    if (nativeBlockUid) containerAttributes["data-block-uid"] = nativeBlockUid;
    if (blockContainerUid) containerAttributes["data-uid"] = blockContainerUid;

    container = {
      classList: new ClassList(["roam-block-container"]),
      isConnected: isConnected,
      attributes: containerAttributes,
      children: [],
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        if (selector.startsWith("[id^='block-input']")) {
          const inputs = [];
          if (input) inputs.push(input);
          for (const child of nestedContainers) {
            inputs.push(...child.querySelectorAll(selector));
          }
          return inputs;
        }
        if (selector === ".rm-bullet") {
          const bullets = [bullet];
          for (const child of nestedContainers) {
            bullets.push(...child.querySelectorAll(selector));
          }
          return bullets;
        }
        if (selector === ".roam-block-container") return nestedContainers.slice();
        if (selector === ".rm-block-children") {
          return nestedContainers.length ? [{}] : [];
        }
        return [];
      },
      closest() {
        return null;
      },
      appendChild(element) {
        this.children.push(element);
        buttonContainer = element;
        if (element?.id) nodesById.set(element.id, element);
        return element;
      },
      contains(node) {
        if (node === input || node === buttonContainer) return true;
        return nestedContainers.some((child) => child.contains(node));
      },
      getBoundingClientRect: () => ({ top: 0, height: 24 }),
    };

    return container;
  };

  const container = createBlockContainer({
    inputId,
    blockUid,
    dataUid,
    inputDataBlockUid,
    containerDataUid,
    nested,
    skipOwnInput,
    collapsed,
    connected,
    inputTagName,
  });

  for (const extra of extraInputs) {
    nodesById.set(extra.id, extra);
  }

  const renderForContainer = (target = container) => {
    if (!windowMock.__extension) {
      throw new Error("extension onload seam is missing");
    }
    windowMock.__extension.onload();
    listeners.get("document:pointermove")({
      target: {
        closest(selector) {
          return selector === ".roam-block-container" ? target : null;
        },
      },
    });
    return renderedIcon?.props || null;
  };

  const pointerMove = (target = container) => {
    listeners.get("document:pointermove")({
      target: {
        closest(selector) {
          return selector === ".roam-block-container" ? target : null;
        },
      },
    });
    return renderedIcon?.props || null;
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

  const flushTimers = () => {
    const queued = [...pendingTimers.entries()];
    pendingTimers.clear();
    for (const [, timer] of queued) timer.callback();
  };

  const flushAnimationFrames = () => {
    const queued = [...animationFrames.values()];
    animationFrames.clear();
    for (const callback of queued) callback();
  };

  const registerInput = (id, node) => {
    nodesById.set(id, node);
  };

  return {
    api,
    blockGraph,
    buttonExists: () => Boolean(buttonContainer),
    calls,
    container,
    document: documentMock,
    errors,
    event,
    flushAnimationFrames,
    flushTimers,
    listeners,
    pendingTimerCount: () => pendingTimers.size,
    pointerMove,
    registerInput,
    createContainer: (opts = {}) =>
      createBlockContainer({
        inputId: opts.inputId || "block-input-main-other0001",
        blockUid: opts.blockUid ?? null,
        dataUid: opts.dataUid,
        inputDataBlockUid: opts.inputDataBlockUid,
        containerDataUid: opts.containerDataUid,
        nested: opts.nested || [],
        skipOwnInput: opts.skipOwnInput,
        collapsed: opts.collapsed,
        connected: opts.connected !== false,
        inputTagName: opts.inputTagName,
      }),
    renderForContainer,
    statusElement: () => statusElement,
    unload: () => windowMock.__extension.onunload(),
    reload() {
      windowMock.__extension.onunload();
      windowMock.__extension.onload();
    },
    window: windowMock,
  };
};

module.exports = { createRuntime, defaultBlock };
