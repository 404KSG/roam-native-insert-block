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
  scope = "ordinary",
  ownCaretClass = [],
  documentMode = false,
  versionBlock = false,
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
      const siblings = this.parentElement?.children;
      const index = siblings?.indexOf(this) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      this.parentElement = null;
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

  body.parentElement = documentElement;

  const getById = (id) => {
    calls.getElementById.push(id);
    if (styleElement?.id === id) return styleElement;
    if (buttonContainer?.id === id) return buttonContainer.parentElement?.isConnected === false ? null : buttonContainer;
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

  const mutationObservers = new Set();
  const isWithin = (node, ancestor) => {
    for (let current = node; current; current = current.parentElement) if (current === ancestor) return true;
    return false;
  };
  const matchesSelector = (node, selector) => selector.split(',').some(part => {
    const token = part.trim();
    return token.startsWith('.') ? node.classList?.contains(token.slice(1)) : token.startsWith('#') && node.id === token.slice(1);
  });
  const closestNode = (node, selector) => {
    for (let current = node; current; current = current.parentElement) if (matchesSelector(current, selector)) return current;
    return null;
  };
  const contextNode = (classes, parentElement = null, id = '') => ({
    classList: new ClassList(classes), parentElement, id,
    closest(selector) { return closestNode(this, selector); },
  });
  const recordMatches = (record, registrations) => [...registrations].some(([target, options]) => {
    if (record.target !== target && !(options.subtree && isWithin(record.target, target))) return false;
    if (record.type === 'childList') return Boolean(options.childList);
    return record.type === 'attributes' && options.attributes && (!options.attributeFilter || options.attributeFilter.includes(record.attributeName));
  });
  const queueMutation = record => {
    for (const observer of mutationObservers) if (recordMatches(record, observer.registrations)) observer.pending.push(record);
  };
  class MutationObserverMock {
    constructor(callback) { this.callback = callback; this.registrations = new Map(); this.pending = []; }
    observe(target, options = {}) {
      mutationObservers.add(this);
      this.registrations.set(target, { ...options });
    }
    disconnect() { mutationObservers.delete(this); this.registrations.clear(); this.pending.length = 0; }
  }
  const deliverMutations = () => {
    for (const observer of [...mutationObservers]) {
      if (!mutationObservers.has(observer)) continue;
      const records = observer.pending.splice(0);
      if (records.length) observer.callback(records);
    }
  };

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
    scope: containerScope = scope,
    ownCaretClass: caretClasses = ownCaretClass,
    documentMode: isDocumentMode = documentMode,
    versionBlock: isVersionBlock = versionBlock,
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
    const ownCaret = caretClasses === null ? null : {
      classList: new ClassList(caretClasses),
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
    };
    const controls = {
      closest(selector) {
        return selector === ".roam-block-container" ? container : null;
      },
      querySelector(selector) {
        return selector === ".rm-caret" || selector === ".block-expand"
          ? ownCaret
          : null;
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

    const mainBody = contextNode(['roam-body-main'], body);
    const article = contextNode(['roam-article'], mainBody);
    const shell = contextNode(isDocumentMode ? ['rm-block--document'] : [], article);
    const sidebar = contextNode(['rm-sidebar-outline', 'rm-sidebar-window'], body, 'right-sidebar');
    const exclusions = { reference: 'rm-inline-reference', embed: 'rm-embed-container', query: 'rm-query', 'roam-query': 'roam-query', mentions: 'rm-mentions', desk: 'rm-desk-outline' };
    const wrapper = contextNode([], shell);
    const setContext = (nextScope, notify = true) => {
      const previousClass = [...wrapper.classList.classes].join(' '), previousParent = wrapper.parentElement;
      wrapper.classList = new ClassList(nextScope === 'ordinary' || nextScope === 'descendant' ? ['rm-block-children'] : ['rm-zoom-block-wrapper']);
      wrapper.parentElement = nextScope === 'sidebar-root' ? sidebar : nextScope === 'unknown' ? body
        : exclusions[nextScope] ? contextNode([exclusions[nextScope]], shell)
        : nextScope === 'descendant' ? contextNode(['roam-block-container'], contextNode(['rm-zoom-block-wrapper'], shell)) : shell;
      if (notify && previousClass !== [...wrapper.classList.classes].join(' ')) queueMutation({ type: 'attributes', target: wrapper, attributeName: 'class' });
      if (notify && previousParent !== wrapper.parentElement) queueMutation({ type: 'childList', target: previousParent, removedNodes: [wrapper] });
    };
    setContext(containerScope, false);
    let connectedOverride = isConnected;
    container = {
      classList: new ClassList(["roam-block-container"]),
      parentElement: wrapper,
      get isConnected() { return connectedOverride && isWithin(this, body); },
      set isConnected(value) { connectedOverride = Boolean(value); },
      attributes: containerAttributes,
      children: [],
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      querySelector(selector) {
        if (selector === ".rm-version-choice-wrapper") return isVersionBlock ? {} : null;
        if (selector === ".version-bullet") return null;
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        if (selector === '#native-insert-block-btn-container') return this.children.filter(child => child.id === 'native-insert-block-btn-container');
        if (selector.startsWith("[id^='block-input']")) {
          const inputs = [];
          if (input) inputs.push(input);
          for (const child of nestedContainers) {
            inputs.push(...child.querySelectorAll(selector));
          }
          return inputs;
        }
        if (selector === ".rm-block__controls") return [controls];
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
      closest(selector) { return closestNode(this, selector); },
      appendChild(element) {
        element.parentElement = this;
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
      nativeCaret: ownCaret,
      scopeNodes: { wrapper, shell, article, mainBody, sidebar },
      setScope(nextScope) { setContext(nextScope); },
      removeZoomMarker() {
        wrapper.classList.toggle('rm-zoom-block-wrapper', false);
        queueMutation({ type: 'attributes', target: wrapper, attributeName: 'class' });
      },
      moveArticleToSidebar() {
        const oldParent = article.parentElement; article.parentElement = sidebar;
        queueMutation({ type: 'childList', target: oldParent, removedNodes: [article] });
      },
      removeMainMarker() {
        mainBody.classList.toggle('roam-body-main', false);
        queueMutation({ type: 'attributes', target: mainBody, attributeName: 'class' });
      },
      makeAncestorSidebar() {
        article.id = 'right-sidebar';
        queueMutation({ type: 'attributes', target: article, attributeName: 'id' });
      },
      detachWrapper() {
        const oldParent = wrapper.parentElement; wrapper.parentElement = null;
        queueMutation({ type: 'childList', target: oldParent, removedNodes: [wrapper] });
      },
      reinsertWrapperInSidebar() {
        wrapper.parentElement = sidebar;
        queueMutation({ type: 'childList', target: sidebar, addedNodes: [wrapper] });
      },
      setConnected(connected) {
        this.isConnected = connected;
        queueMutation({ type: 'childList', target: this.parentElement, removedNodes: connected ? [] : [this] });
      },
    };

    controls.parentElement = container;
    bullet.parentElement = controls;
    if (ownCaret) ownCaret.parentElement = controls;
    if (input) input.parentElement = container;
    for (const child of nestedContainers) child.parentElement = contextNode(['rm-block-children'], container);
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
    scope,
    ownCaretClass,
    documentMode,
    versionBlock,
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
    buttonClassContains: (className) => Boolean(buttonContainer?.classList?.contains(className)),
    calls,
    container,
    document: documentMock,
    errors,
    event,
    flushAnimationFrames,
    flushTimers,
    listeners,
    pendingTimerCount: () => pendingTimers.size,
    triggerMutations: deliverMutations,
    queueMutation,
    observerRegistrations: () => [...mutationObservers].map(observer => [...observer.registrations]),
    activeObserverCount: () => mutationObservers.size,
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
        scope: opts.scope ?? scope,
        ownCaretClass: opts.ownCaretClass ?? ownCaretClass,
        documentMode: opts.documentMode ?? documentMode,
        versionBlock: opts.versionBlock ?? versionBlock,
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
