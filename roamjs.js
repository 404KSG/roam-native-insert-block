const resolveActionMode = ({ shiftKey, ctrlKey, metaKey, altKey }) => {
  const activeModifiers = [shiftKey, ctrlKey, metaKey, altKey].filter(Boolean);
  if (activeModifiers.length > 1) return null;
  if (shiftKey) return "delete";
  if (ctrlKey) return "wrap";
  if (metaKey) return "child";
  if (altKey) return "above";
  return "below";
};

(() => {
const BUTTON_CONTAINER_ID = "native-insert-block-btn-container";
const STYLE_ID = "native-insert-block-styles";
const STATUS_ID = "native-insert-block-status";
const BLOCK_INPUT_SELECTOR = "[id^='block-input']";
const BLOCK_INPUT_ID_PREFIX = "block-input-";
const BLOCK_CONTAINER_SELECTOR = ".roam-block-container";
const NO_CHILDREN_CLASS = "native-insert-block-no-children";
const VISIBLE_CLASS = "native-insert-block-visible";
const DOCUMENT_MODE_CLASS = "native-insert-block-document-mode";
const ROAM_HIGHLIGHT_CLASS = "rm-block-highlight";
const DOCUMENT_MODE_SELECTOR =
  ".rm-block--document, .rm-block__children--document";
const DEFAULT_BUTTON_SIZE = 24;
const CARET_BUTTON_GAP_PX = 4;
const STATUS_VISIBLE_MS = 2500;

const MAX_FOCUS_ATTEMPTS = 20;
const FOCUS_RETRY_DELAY_MS = 60;
const POST_INSERT_FOCUS_DELAY_MS = 80;
const PLUGIN_LOAD_RETRY_MS = 500;
const SCROLL_THROTTLE_MS = 100;

let activeBlockContainer = null;
let activeBlockInputId = null;
let activeTargetSnapshot = null;
let activeHighlightObserver = null;
let statusTimer = null;
let scrollTimer = null;
let pluginLoadTimer = null;
let lifecycleGeneration = 0;
let latestFocusOperation = 0;
let pluginActive = false;
let positionFrame = null;
let pendingPositionApply = null;
const focusTimers = new Set();

const isCurrentLifecycle = (generation) =>
  pluginActive && generation === lifecycleGeneration;

const scheduleFocus = (callback, delay, generation) => {
  if (!isCurrentLifecycle(generation)) return null;
  const timer = setTimeout(() => {
    focusTimers.delete(timer);
    if (isCurrentLifecycle(generation)) callback();
  }, delay);
  focusTimers.add(timer);
  return timer;
};

const clearFocusTimers = () => {
  for (const timer of focusTimers) clearTimeout(timer);
  focusTimers.clear();
};

const addStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const css = `.roam-block-container { position: relative; }
      #${BUTTON_CONTAINER_ID} { display: none; justify-content: center; align-items: center; position: absolute; top: 18px; left: 0; height: ${DEFAULT_BUTTON_SIZE}px; width: ${DEFAULT_BUTTON_SIZE}px; z-index: 99; pointer-events: auto; }
      #${BUTTON_CONTAINER_ID}.${VISIBLE_CLASS} { display: flex; }
      #${BUTTON_CONTAINER_ID}.${NO_CHILDREN_CLASS} { top: 2px; }
      #${BUTTON_CONTAINER_ID}.${DOCUMENT_MODE_CLASS} { top: 1px; }
      #${BUTTON_CONTAINER_ID} .bp3-icon { cursor: pointer; color: #A7B6C2; background: none; border-radius: 0; box-shadow: none; transition: color 0.1s ease-in-out; padding: 2px; }
      #${BUTTON_CONTAINER_ID} .bp3-icon:hover { color: #5C7080; }
      #${STATUS_ID} { position: fixed; right: 16px; bottom: 16px; z-index: 9999; pointer-events: none; max-width: 280px; padding: 8px 10px; border-radius: 4px; background: #182026; color: #f5f8fa; font-size: 12px; line-height: 1.4; }`;
  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.innerHTML = css;
  document.head.appendChild(styleElement);
};

const removeStyles = () => {
  document.getElementById(STYLE_ID)?.remove();
};

const determineChildrenState = (container) => {
  const childrenContainer = container.querySelector(".rm-block-children");
  const hasRenderedChildren =
    childrenContainer && container.querySelector(".roam-block-container");
  const bullet = container.querySelector(".rm-bullet");
  const isCollapsedWithChildren =
    bullet && bullet.classList.contains("rm-bullet--closed");

  return Boolean(hasRenderedChildren || isCollapsedWithChildren);
};

const isDocumentMode = (container) =>
  Boolean(container?.closest?.(DOCUMENT_MODE_SELECTOR));

const getOwnBullet = (container) => {
  const bullets = container?.querySelectorAll?.(".rm-bullet");
  if (!bullets) return null;

  return (
    Array.from(bullets).find(
      (bullet) => bullet?.closest?.(BLOCK_CONTAINER_SELECTOR) === container
    ) || null
  );
};

const getOwnBulletAnchor = (container) => {
  const ownBullet = getOwnBullet(container);
  if (!ownBullet) return null;
  return ownBullet.querySelector?.(".rm-bullet__inner") || ownBullet;
};

const getOwnBlockInput = (container) => {
  const inputs = container?.querySelectorAll?.(BLOCK_INPUT_SELECTOR);
  if (!inputs || inputs.length === 0) return null;

  return (
    Array.from(inputs).find(
      (input) => input?.closest?.(BLOCK_CONTAINER_SELECTOR) === container
    ) || null
  );
};

const readAttr = (node, name) => {
  if (!node || typeof name !== "string") return null;
  if (typeof node.getAttribute === "function") {
    const value = node.getAttribute(name);
    if (typeof value === "string" && value.length > 0) return value;
  }
  if (name === "data-block-uid") {
    const value = node.dataset?.blockUid;
    if (typeof value === "string" && value.length > 0) return value;
  }
  if (name === "data-uid") {
    const value = node.dataset?.uid;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
};

const isNodeConnected = (node) => {
  if (!node) return false;
  if (typeof node.isConnected === "boolean") return node.isConnected;
  try {
    if (typeof document.contains === "function") {
      return document.contains(node);
    }
  } catch (error) {
    /* ignore */
  }
  return true;
};

const captureTargetSnapshot = (container) => {
  const input = getOwnBlockInput(container);
  if (!input) return null;
  return {
    container,
    input,
    inputId: typeof input.id === "string" ? input.id : "",
    blockUid: readAttr(container, "data-block-uid"),
    inputDataUid: readAttr(input, "data-uid"),
    inputDataBlockUid: readAttr(input, "data-block-uid"),
    containerDataUid: readAttr(container, "data-uid"),
  };
};

const snapshotsMatch = (left, right) =>
  Boolean(
    left &&
      right &&
      left.container === right.container &&
      left.input === right.input &&
      left.inputId === right.inputId &&
      left.blockUid === right.blockUid &&
      left.inputDataUid === right.inputDataUid &&
      left.inputDataBlockUid === right.inputDataBlockUid &&
      left.containerDataUid === right.containerDataUid
  );

const parseWindowIdFromInput = (inputId, uid) => {
  if (typeof inputId !== "string" || typeof uid !== "string" || !uid) {
    return null;
  }
  if (!inputId.startsWith(BLOCK_INPUT_ID_PREFIX)) return null;
  const suffix = `-${uid}`;
  if (!inputId.endsWith(suffix)) return null;
  const windowId = inputId.slice(
    BLOCK_INPUT_ID_PREFIX.length,
    inputId.length - suffix.length
  );
  if (!windowId) return null;
  if (`${BLOCK_INPUT_ID_PREFIX}${windowId}-${uid}` !== inputId) return null;
  return windowId;
};

const auxiliaryUidsConflict = (snapshot, uid) => {
  const extras = [
    snapshot?.inputDataUid,
    snapshot?.inputDataBlockUid,
    snapshot?.containerDataUid,
  ];
  return extras.some((value) => value && value !== uid);
};

const clearStatus = () => {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  document.getElementById(STATUS_ID)?.remove();
};

const showStatus = (message, generation) => {
  if (typeof message !== "string" || !message) return;
  if (!pluginActive || generation !== lifecycleGeneration) return;
  let status = document.getElementById(STATUS_ID);
  if (!status) {
    status = document.createElement("div");
    status.id = STATUS_ID;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const parent = document.body || document.documentElement;
    if (!parent?.appendChild) return;
    parent.appendChild(status);
  }
  status.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusTimer = null;
    if (!pluginActive || generation !== lifecycleGeneration) return;
    status.remove();
  }, STATUS_VISIBLE_MS);
};

const getOwnControls = (container) => {
  const controls = container?.querySelectorAll?.(".rm-block__controls");
  if (!controls) return null;

  return (
    Array.from(controls).find(
      (control) => control?.closest?.(".roam-block-container") === container
    ) || null
  );
};

const getOwnCaretAnchor = (container) => {
  const controls = getOwnControls(container);
  if (!controls) return null;

  const caretCandidate =
    controls.querySelector?.(".rm-caret") ||
    controls.querySelector?.(".block-expand") ||
    null;
  const nestedCaret = caretCandidate?.querySelector?.(".rm-caret") || null;
  const caret = nestedCaret || caretCandidate;

  return caret?.closest?.(".roam-block-container") === container
    ? caret
    : null;
};

const getBulletAnchoredTop = (container, button) => {
  const bullet = getOwnBulletAnchor(container);
  if (!bullet) return { top: null, retry: false };

  try {
    const computedStyle = window.getComputedStyle?.(bullet);
    if (
      computedStyle?.display === "none" ||
      computedStyle?.visibility === "hidden"
    ) {
      return { top: null, retry: false };
    }
  } catch (e) {
    return { top: null, retry: false };
  }

  const containerRect = container.getBoundingClientRect?.();
  const bulletRect = bullet.getBoundingClientRect?.();
  const buttonRect = button.getBoundingClientRect?.();
  const values = [
    containerRect?.top,
    containerRect?.height,
    bulletRect?.top,
    bulletRect?.height,
    buttonRect?.height,
  ];

  if (!values.every(Number.isFinite)) return { top: null, retry: false };
  if (
    containerRect.height <= 0 ||
    bulletRect.height <= 0 ||
    buttonRect.height <= 0
  ) {
    return { top: null, retry: true };
  }

  return {
    top:
      bulletRect.top +
      bulletRect.height / 2 -
      containerRect.top -
      buttonRect.height / 2,
    retry: false,
  };
};

const getCaretAnchoredTop = (container, button) => {
  const caret = getOwnCaretAnchor(container);
  if (!caret || !button) return { top: null, retry: false };

  try {
    const computedStyle = window.getComputedStyle?.(caret);
    if (
      computedStyle?.display === "none" ||
      computedStyle?.visibility === "hidden"
    ) {
      return { top: null, retry: false };
    }
  } catch (e) {
    return { top: null, retry: false };
  }

  const containerRect = container.getBoundingClientRect?.();
  const caretRect = caret.getBoundingClientRect?.();
  const previousTop = button.style.top;
  let buttonRect;
  try {
    button.style.top = "";
    buttonRect = button.getBoundingClientRect?.();
  } finally {
    button.style.top = previousTop;
  }
  const values = [
    containerRect?.top,
    containerRect?.height,
    caretRect?.top,
    caretRect?.height,
    buttonRect?.top,
    buttonRect?.height,
  ];

  if (!values.every(Number.isFinite)) return { top: null, retry: false };
  if (
    containerRect.height <= 0 ||
    caretRect.height <= 0 ||
    buttonRect.height <= 0
  ) {
    return { top: null, retry: true };
  }

  const defaultTop = buttonRect.top - containerRect.top;
  // Keep the theme's established parent placement when it already clears the
  // caret. The 24px button box must not start below the caret, or its centered
  // plus icon drops by another half-box.
  const minimumButtonCenter =
    caretRect.top + caretRect.height + CARET_BUTTON_GAP_PX;
  const requiredOffset = Math.max(
    0,
    minimumButtonCenter - (buttonRect.top + buttonRect.height / 2)
  );

  if (requiredOffset === 0) return { top: null, retry: false };

  return {
    top: defaultTop + requiredOffset,
    retry: false,
  };
};

const getVersionState = (container) => {
  const versionChoice = container.querySelector(".rm-version-choice-wrapper");
  const versionBullet = container.querySelector(".version-bullet");
  if (!versionChoice && !versionBullet) {
    return { isVersionBlock: false };
  }

  const controls = container.querySelector(".rm-block__controls");
  const caretCandidate =
    controls?.querySelector?.(".rm-caret") ||
    controls?.querySelector?.(".block-expand") ||
    null;

  const nestedCaret =
    caretCandidate?.querySelector?.(".rm-caret") instanceof HTMLElement
      ? caretCandidate.querySelector(".rm-caret")
      : null;

  const caretElement = nestedCaret || caretCandidate;
  const caretClosed =
    caretElement?.classList?.contains?.("rm-caret-closed") ||
    container.classList.contains("rm-block--closed") ||
    false;
  const caretHidden =
    caretElement?.classList?.contains?.("rm-caret-hidden") || false;
  const isCollapsed = Boolean(
    caretClosed || container.classList.contains("rm-block--closed")
  );

  return {
    isVersionBlock: true,
    versionChoice,
    versionBullet,
    controls,
    caretElement,
    caretClosed,
    caretHidden,
    isCollapsed,
  };
};

const updateButtonState = (container, defer = true) => {
  const button = document.getElementById(BUTTON_CONTAINER_ID);
  if (!button) return;
  const versionState = getVersionState(container);
  const hasChildren = determineChildrenState(container);
  const documentMode = isDocumentMode(container);
  const shouldOffset =
    !documentMode && versionState.isVersionBlock && versionState.isCollapsed;
  const treatAsChildren =
    !documentMode &&
    (hasChildren ||
      (versionState.isVersionBlock && versionState.isCollapsed));
  const shouldUseCaretAnchor = !documentMode && hasChildren;
  button.classList.toggle(DOCUMENT_MODE_CLASS, documentMode);
  button.classList.toggle(NO_CHILDREN_CLASS, !treatAsChildren);
  adjustButtonPosition(
    container,
    button,
    versionState,
    shouldOffset,
    !hasChildren,
    shouldUseCaretAnchor,
    defer
  );
};

const queueButtonPosition = (applyPosition) => {
  if (typeof requestAnimationFrame !== "function") {
    applyPosition();
    return;
  }

  pendingPositionApply = applyPosition;
  if (positionFrame !== null) return;
  positionFrame = requestAnimationFrame(() => {
    positionFrame = null;
    const pendingApply = pendingPositionApply;
    pendingPositionApply = null;
    pendingApply?.();
  });
};

const applyFallbackButtonPosition = (
  container,
  button,
  versionState,
  shouldOffset
) => {
  if (!versionState?.isVersionBlock || !shouldOffset) {
    button.style.top = "";
    return;
  }

  const buttonRect = button.getBoundingClientRect();
  if (!buttonRect?.height) {
    button.style.top = "";
    return;
  }

  const buttonHeight = buttonRect.height || DEFAULT_BUTTON_SIZE;
  const previousTop = button.style.top;
  button.style.top = "";
  const defaultTop = parseFloat(
    window.getComputedStyle(button).top || "0"
  );
  button.style.top = previousTop;

  const baseTop = Number.isFinite(defaultTop)
    ? defaultTop
    : buttonRect.top - container.getBoundingClientRect().top -
      buttonHeight / 2;
  const offset = Math.max(baseTop, 0);
  const rounded = Math.round(offset);
  if (button.style.top !== `${rounded}px`) {
    button.style.top = `${rounded}px`;
  }
};

const adjustButtonPosition = (
  container,
  button,
  versionState,
  shouldOffset,
  shouldUseBulletAnchor,
  shouldUseCaretAnchor,
  defer = true,
  allowRetry = true
) => {
  if (!container || !button) return;

  const applyPosition = () => {
    if (shouldUseCaretAnchor) {
      const anchor = getCaretAnchoredTop(container, button);
      if (Number.isFinite(anchor.top)) {
        const nextTop = `${anchor.top}px`;
        if (button.style.top !== nextTop) {
          button.style.top = nextTop;
        }
        return;
      }

      applyFallbackButtonPosition(container, button, versionState, shouldOffset);
      if (allowRetry && anchor.retry) {
        queueButtonPosition(() =>
          adjustButtonPosition(
            container,
            button,
            versionState,
            shouldOffset,
            shouldUseBulletAnchor,
            shouldUseCaretAnchor,
            false,
            false
          )
        );
      }
      return;
    }

    if (!shouldUseBulletAnchor) {
      applyFallbackButtonPosition(container, button, versionState, shouldOffset);
      return;
    }

    const anchor = getBulletAnchoredTop(container, button);
    if (Number.isFinite(anchor.top)) {
      const nextTop = `${anchor.top}px`;
      if (button.style.top !== nextTop) {
        button.style.top = nextTop;
      }
      return;
    }

    applyFallbackButtonPosition(container, button, versionState, shouldOffset);
    if (allowRetry && anchor.retry) {
      queueButtonPosition(() =>
        adjustButtonPosition(
          container,
          button,
          versionState,
          shouldOffset,
          shouldUseBulletAnchor,
          shouldUseCaretAnchor,
          false,
          false
        )
      );
    }
  };

  if (!defer) {
    applyPosition();
    return;
  }

  // Keep deferred callers coalesced into one layout pass so they do not
  // repeatedly read/write the button geometry in the same frame.
  queueButtonPosition(applyPosition);
};

const cancelPendingPosition = () => {
  if (positionFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(positionFrame);
  }
  positionFrame = null;
  pendingPositionApply = null;
};

const stopHighlightObserver = () => {
  if (activeHighlightObserver) {
    activeHighlightObserver.disconnect();
    activeHighlightObserver = null;
  }
};

const removeButton = () => {
  cancelPendingPosition();
  stopHighlightObserver();
  const button = document.getElementById(BUTTON_CONTAINER_ID);
  if (button) {
    if (window.ReactDOM?.unmountComponentAtNode) {
      try {
        window.ReactDOM.unmountComponentAtNode(button);
      } catch (e) {
        /* ignore */
      }
    }
    button.remove();
  }
  activeBlockContainer = null;
  activeBlockInputId = null;
  activeTargetSnapshot = null;
};

const watchHighlight = (container) => {
  stopHighlightObserver();
  activeHighlightObserver = new MutationObserver(() => {
    if (
      activeBlockContainer === container &&
      container.classList.contains(ROAM_HIGHLIGHT_CLASS)
    ) {
      removeButton();
    }
  });
  activeHighlightObserver.observe(container, {
    attributes: true,
    attributeFilter: ["class"],
  });
};

const buildBlockInputId = (windowId, uid) =>
  windowId && uid ? `${BLOCK_INPUT_ID_PREFIX}${windowId}-${uid}` : null;

const findExactBlockInput = (uid, windowId) => {
  const exactId = buildBlockInputId(windowId, uid);
  if (!exactId) return null;
  return document.getElementById(exactId) || null;
};

const getFocusedBlockInfo = () => {
  try {
    const focused = window.roamAlphaAPI?.ui?.getFocusedBlock?.();
    if (!focused) return { uid: null, windowId: null };
    return {
      uid: focused["block-uid"] || focused.uid || null,
      windowId: focused["window-id"] || null,
    };
  } catch (error) {
    return { uid: null, windowId: null };
  }
};

const isAlreadyFocused = (uid, windowId) => {
  const focused = getFocusedBlockInfo();
  if (focused.uid !== uid) return false;
  if (windowId) return focused.windowId === windowId;
  return true;
};

const requestBlockFocus = (uid, windowId, selectionLength) => {
  const ui = window.roamAlphaAPI?.ui;
  if (!ui?.setBlockFocusAndSelection) return;
  const location = { "block-uid": uid };
  if (windowId) location["window-id"] = windowId;
  try {
    const result = ui.setBlockFocusAndSelection({
      location,
      selection: { start: selectionLength, end: selectionLength },
    });
    if (result && typeof result.then === "function") {
      result.catch(() => {});
    }
  } catch (error) {
    /* ignore sync focus errors */
  }
};

const applyDomFocus = (textarea) => {
  const selectionLength =
    typeof textarea.value === "string"
      ? textarea.value.length
      : textarea.textContent?.length ?? 0;
  if (typeof textarea.focus === "function") {
    textarea.focus();
  }
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(selectionLength, selectionLength);
  } else if ("selectionStart" in textarea && "selectionEnd" in textarea) {
    textarea.selectionStart = selectionLength;
    textarea.selectionEnd = selectionLength;
  }
  return selectionLength;
};

const focusInsertedBlock = (
  uid,
  windowId,
  lifecycleToken,
  operationToken,
  attemptsLeft = MAX_FOCUS_ATTEMPTS
) => {
  if (!uid || attemptsLeft <= 0 || !isCurrentLifecycle(lifecycleToken)) {
    return;
  }
  if (operationToken !== latestFocusOperation) return;
  if (isAlreadyFocused(uid, windowId)) return;

  const textarea = findExactBlockInput(uid, windowId);
  const selectionLength = textarea
    ? typeof textarea.value === "string"
      ? textarea.value.length
      : textarea.textContent?.length ?? 0
    : 0;

  requestBlockFocus(uid, windowId, selectionLength);

  if (textarea) {
    const runDomFocus = () => {
      if (!isCurrentLifecycle(lifecycleToken)) return;
      if (operationToken !== latestFocusOperation) return;
      applyDomFocus(textarea);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(runDomFocus);
    } else {
      runDomFocus();
    }
    return;
  }

  scheduleFocus(
    () =>
      focusInsertedBlock(
        uid,
        windowId,
        lifecycleToken,
        operationToken,
        attemptsLeft - 1
      ),
    FOCUS_RETRY_DELAY_MS,
    lifecycleToken
  );
};

const getNestedUid = (obj) =>
  obj?.[":block/uid"] ?? obj?.["block/uid"] ?? obj?.uid ?? null;

const pullBlockMetadata = (blockUid) => {
  const api = window.roamAlphaAPI;
  const pullFn =
    api?.data?.pull?.bind(api.data) ?? api?.pull?.bind(api) ?? null;
  if (!pullFn) {
    console.error("Native Insert Block: data.pull is unavailable");
    return null;
  }
  try {
    return pullFn(
      "[:block/uid :block/string :block/order :node/title {:block/children [:block/uid]} {:block/_children [:block/uid]} {:block/parents [:block/uid]} {:block/page [:block/uid]}]",
      [":block/uid", blockUid]
    );
  } catch (error) {
    console.error("Native Insert Block: Failed to load block data", error);
    return null;
  }
};

const getBlockString = (blockData) =>
  blockData?.[":block/string"] ??
  blockData?.["block/string"] ??
  blockData?.string;

const isPageEntity = (blockData) => {
  const title =
    blockData?.[":node/title"] ??
    blockData?.["node/title"] ??
    blockData?.title;
  return typeof title === "string";
};

const isMatchingBlockEntity = (blockData, uid) => {
  if (!blockData || !uid) return false;
  if (isPageEntity(blockData)) return false;
  const pulledUid = getNestedUid(blockData);
  if (pulledUid !== uid) return false;
  return typeof getBlockString(blockData) === "string";
};

const resolveValidatedTarget = (container, snapshot) => {
  if (!pluginActive) return { error: "stale" };
  if (!snapshot || snapshot.container !== container) return { error: "stale" };
  if (!isNodeConnected(container) || !isNodeConnected(snapshot.input)) {
    return { error: "stale" };
  }
  const current = captureTargetSnapshot(container);
  if (!snapshotsMatch(snapshot, current)) return { error: "stale" };

  const uid = snapshot.blockUid;
  if (!uid) return { error: "missing" };
  if (auxiliaryUidsConflict(snapshot, uid)) return { error: "ambiguous" };

  const windowId = parseWindowIdFromInput(snapshot.inputId, uid);
  if (!windowId) return { error: "missing" };

  const blockData = pullBlockMetadata(uid);
  if (!isMatchingBlockEntity(blockData, uid)) return { error: "missing" };
  return { uid, windowId, blockData };
};

const isEmptyBlock = (blockData) => {
  if (!blockData) return false;
  const string =
    blockData[":block/string"] ??
    blockData["block/string"] ??
    blockData.string ??
    null;
  const children =
    blockData[":block/children"] ??
    blockData["block/children"] ??
    blockData.children ??
    null;
  return string === "" && Array.isArray(children) && children.length === 0;
};

const resolveParentUid = (blockData) => {
  if (!blockData) return null;

  const parentsFromChildren =
    blockData[":block/_children"] ?? blockData["block/_children"];
  if (Array.isArray(parentsFromChildren) && parentsFromChildren.length > 0) {
    const uid = getNestedUid(parentsFromChildren[0]);
    if (uid) return uid;
  }

  const parentsList =
    blockData[":block/parents"] ?? blockData["block/parents"];
  if (Array.isArray(parentsList) && parentsList.length > 0) {
    const uid = getNestedUid(parentsList[0]);
    if (uid) return uid;
  }

  const page =
    blockData[":block/page"] ?? blockData["block/page"] ?? blockData.page;
  return getNestedUid(page);
};

const resolveOrder = (blockData) => {
  if (!blockData) return null;
  const order =
    blockData[":block/order"] ??
    blockData["block/order"] ??
    blockData.order ??
    null;
  return typeof order === "number" ? order : null;
};

const renderButton = (container) => {
  if (!window.React || !window.ReactDOM || !window.roamAlphaAPI) return;
  const snapshot = captureTargetSnapshot(container);
  if (!snapshot) return;

  removeButton();

  activeTargetSnapshot = snapshot;
  activeBlockInputId = snapshot.inputId;
  const renderGeneration = lifecycleGeneration;
  const buttonContainer = document.createElement("div");
  buttonContainer.id = BUTTON_CONTAINER_ID;
  let actionHandledForPress = false;

  const handleInsertClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const actionMode = resolveActionMode(e);
    if (!actionMode) return;
    if (actionHandledForPress) return;
    actionHandledForPress = true;
    if (!pluginActive || renderGeneration !== lifecycleGeneration) return;
    if (!snapshotsMatch(activeTargetSnapshot, snapshot)) return;

    const lifecycleToken = renderGeneration;
    const target = resolveValidatedTarget(container, snapshot);
    if (target.error) {
      removeButton();
      showStatus(
        "Native Insert Block could not identify this block.",
        renderGeneration
      );
      return;
    }

    const blockUid = target.uid;
    const windowHint = target.windowId;
    const blockData = target.blockData;
    const focusedWindowId = getFocusedBlockInfo().windowId;
    const ownBullet = getOwnBullet(container);
    const expandParentAfterInsert = Boolean(
      actionMode === "child" &&
        (ownBullet?.classList?.contains?.("rm-bullet--closed") ||
          container.classList.contains("rm-block--closed"))
    );
    const operationToken = ++latestFocusOperation;

    removeButton();

    if (actionMode === "delete") {
      try {
        await window.roamAlphaAPI.deleteBlock({ block: { uid: blockUid } });
      } catch (error) {
        console.error("Native Insert Block: Failed to delete block", error);
        showStatus(
          "Native Insert Block could not complete that action.",
          renderGeneration
        );
      }
      return;
    }

    let targetParentUid;
    let targetOrder;

    if (actionMode === "wrap") {
      // Ctrl + Click: Insert Parent
      // 1. Get current parent and order
      const currentParentUid = resolveParentUid(blockData);
      const currentOrder = resolveOrder(blockData);

      if (!currentParentUid || typeof currentOrder !== "number") {
        console.error("Native Insert Block: Could not resolve parent or order for Insert Parent");
        showStatus(
          "Native Insert Block could not complete that action.",
          renderGeneration
        );
        return;
      }

      const newParentUid = window.roamAlphaAPI.util.generateUID();
      let parentCreated = false;
      try {
        // 2. Create new parent block at current position
        await window.roamAlphaAPI.createBlock({
          location: { "parent-uid": currentParentUid, order: currentOrder },
          block: { string: "", uid: newParentUid },
        });
        parentCreated = true;

        // 3. Move current block to be child of new parent
        await window.roamAlphaAPI.moveBlock({
          location: { "parent-uid": newParentUid, order: 0 },
          block: { uid: blockUid }
        });

        // 4. Focus new parent block
        scheduleFocus(
          () =>
            focusInsertedBlock(
              newParentUid,
              windowHint || focusedWindowId,
              lifecycleToken,
              operationToken
            ),
          POST_INSERT_FOCUS_DELAY_MS,
          lifecycleToken
        );
      } catch (error) {
        if (parentCreated) {
          const latestBlockData = pullBlockMetadata(blockUid);
          const latestParentUid = resolveParentUid(latestBlockData);
          const newParentData =
            latestBlockData && latestParentUid !== newParentUid
              ? pullBlockMetadata(newParentUid)
              : null;
          if (
            latestBlockData &&
            latestParentUid !== newParentUid &&
            isEmptyBlock(newParentData)
          ) {
            try {
              await window.roamAlphaAPI.deleteBlock({
                block: { uid: newParentUid },
              });
            } catch (rollbackError) {
              console.error(
                "Native Insert Block: Failed to roll back empty parent block",
                rollbackError
              );
            }
          }
        }
        console.error("Native Insert Block: Failed to insert parent block", error);
        showStatus(
          "Native Insert Block could not complete that action.",
          renderGeneration
        );
      }
      return;
    }

    if (actionMode === "child") {
      // Cmd + Click: Insert Child
      targetParentUid = blockUid;
      const children = blockData[":block/children"] || blockData["block/children"] || [];
      targetOrder = children.length;
    } else {
      // Normal or Option Click: Need parent and current order
      targetParentUid = resolveParentUid(blockData);
      const currentOrder = resolveOrder(blockData);

      if (!targetParentUid || typeof currentOrder !== "number") {
        console.error(
          "Native Insert Block: Could not resolve parent or order",
          blockUid,
          blockData
        );
        showStatus(
          "Native Insert Block could not complete that action.",
          renderGeneration
        );
        return;
      }

      if (actionMode === "above") {
        // Option/Alt + Click: Insert Above
        targetOrder = currentOrder;
      } else {
        // Normal Click: Insert Below
        targetOrder = currentOrder + 1;
      }
    }

    const newUid = window.roamAlphaAPI.util.generateUID();
    try {
      await window.roamAlphaAPI.createBlock({
        location: { "parent-uid": targetParentUid, order: targetOrder },
        block: { string: "", uid: newUid },
      });
      if (expandParentAfterInsert && window.roamAlphaAPI.updateBlock) {
        try {
          await window.roamAlphaAPI.updateBlock({
            block: { uid: blockUid, open: true },
          });
        } catch (error) {
          console.error(
            "Native Insert Block: Failed to expand parent block",
            error
          );
        }
      }
      scheduleFocus(
        () =>
          focusInsertedBlock(
            newUid,
            windowHint || focusedWindowId,
            lifecycleToken,
            operationToken
          ),
        POST_INSERT_FOCUS_DELAY_MS,
        lifecycleToken
      );
    } catch (error) {
      console.error("Native Insert Block: Failed to insert block", error);
      showStatus(
        "Native Insert Block could not complete that action.",
        renderGeneration
      );
    }
  };

  const handleContextMenu = (e) => {
    if (!e.ctrlKey) return;
    return handleInsertClick(e);
  };

  const handleMouseDown = (e) => {
    // Browser text selection starts during mousedown, before the click handler
    // can run. Keep the editor's current selection stable while the control is
    // pressed; the click/contextmenu handlers still own the actual action.
    actionHandledForPress = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const buttonElement = window.React.createElement(window.Blueprint.Core.Icon, {
    icon: "plus",
    size: 12,
    onClick: handleInsertClick,
    onContextMenu: handleContextMenu,
    onMouseDown: handleMouseDown,
  });

  container.appendChild(buttonContainer);
  window.ReactDOM.render(buttonElement, buttonContainer);
  buttonContainer.classList.add(VISIBLE_CLASS);
  buttonContainer.style.visibility = "hidden";
  updateButtonState(container, false);
  buttonContainer.style.visibility = "";
  watchHighlight(container);
  activeBlockContainer = container;
};

const handlePointerMove = (e) => {
  const container = e.target.closest(".roam-block-container");
  if (!container) {
    removeButton();
    return;
  }

  if (container.classList.contains(ROAM_HIGHLIGHT_CLASS)) {
    if (activeBlockContainer === container) {
      removeButton();
    }
    return;
  }

  if (container === activeBlockContainer) {
    if (!isNodeConnected(container)) {
      removeButton();
      return;
    }
    const current = captureTargetSnapshot(container);
    if (!current) {
      removeButton();
      return;
    }
    if (!snapshotsMatch(activeTargetSnapshot, current)) {
      renderButton(container);
    }
    return;
  }

  if (!captureTargetSnapshot(container)) {
    removeButton();
    return;
  }
  renderButton(container);
};

// *** 优化点：合并 handlePointerDown 和 handleFocusIn ***
const handleBlockInteraction = (e) => {
  if (!activeBlockContainer) return;
  // 如果交互来自按钮本身，则忽略
  if (e.target.closest(`#${BUTTON_CONTAINER_ID}`)) return;
  // 如果交互发生在当前激活的 block 内部
  if (activeBlockContainer.contains(e.target)) {
    removeButton();
  }
};

const handleKeyDown = (e) => {
  if (activeBlockInputId && e.target.id === activeBlockInputId) {
    removeButton();
  }
};

const handlePointerLeaveViewport = (e) => {
  if (e.target === document.documentElement && !e.relatedTarget) {
    removeButton();
  }
};

const handleScroll = () => {
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    removeButton();
    scrollTimer = null;
  }, SCROLL_THROTTLE_MS);
};

const mainApp = {
  init() {
    lifecycleGeneration += 1;
    pluginActive = true;
    addStyles();
    document.addEventListener("pointermove", handlePointerMove, true);
    document.documentElement.addEventListener(
      "pointerleave",
      handlePointerLeaveViewport
    );
    // *** 优化点：使用新函数 ***
    document.addEventListener("pointerdown", handleBlockInteraction, true);
    document.addEventListener("focusin", handleBlockInteraction, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("scroll", handleScroll, true);
  },
  destroy() {
    pluginActive = false;
    lifecycleGeneration += 1;
    latestFocusOperation += 1;
    removeButton();
    removeStyles();
    clearStatus();
    clearFocusTimers();
    document.removeEventListener("pointermove", handlePointerMove, true);
    document.documentElement.removeEventListener(
      "pointerleave",
      handlePointerLeaveViewport
    );
    // *** 优化点：使用新函数 ***
    document.removeEventListener("pointerdown", handleBlockInteraction, true);
    document.removeEventListener("focusin", handleBlockInteraction, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("scroll", handleScroll, true);

    if (scrollTimer) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }
    if (pluginLoadTimer) {
      clearTimeout(pluginLoadTimer);
      pluginLoadTimer = null;
    }
  },
};

const loadPlugin = () => {
  pluginLoadTimer = null;
  if (
    window.roamAlphaAPI &&
    window.React &&
    window.ReactDOM &&
    window.Blueprint
  ) {
    mainApp.init();
  } else {
    pluginLoadTimer = setTimeout(loadPlugin, PLUGIN_LOAD_RETRY_MS);
  }
};

const unloadExisting = () => {
  // 先卸载已经存在的 Native Insert Block 实例
  if (window.nativeInsertBlockPlugin) {
    window.nativeInsertBlockPlugin.destroy();
    delete window.nativeInsertBlockPlugin;
  }
  // 兼容旧名字 quickInsert*
  if (window.quickInsertPlugin) {
    window.quickInsertPlugin.destroy();
    delete window.quickInsertPlugin;
  }
  if (window.quickInsertBlockV15) {
    window.quickInsertBlockV15.destroy();
    delete window.quickInsertBlockV15;
  }
};

unloadExisting();
loadPlugin();
window.nativeInsertBlockPlugin = mainApp;
})();
