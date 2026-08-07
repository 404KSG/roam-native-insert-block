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
const BLOCK_INPUT_SELECTOR = "[id^='block-input']";
const NO_CHILDREN_CLASS = "native-insert-block-no-children";
const VISIBLE_CLASS = "native-insert-block-visible";
const DOCUMENT_MODE_CLASS = "native-insert-block-document-mode";
const ROAM_HIGHLIGHT_CLASS = "rm-block-highlight";
const DOCUMENT_MODE_SELECTOR =
  ".rm-block--document, .rm-block__children--document";
const DEFAULT_BUTTON_SIZE = 24;
const WINDOW_ID_PATTERN = /^block-input-(.+)-([a-zA-Z0-9_-]{9})$/;

const MAX_FOCUS_ATTEMPTS = 20;
const FOCUS_RETRY_DELAY_MS = 60;
const POST_INSERT_FOCUS_DELAY_MS = 80;
const PLUGIN_LOAD_RETRY_MS = 500;
const SCROLL_THROTTLE_MS = 100;

let activeBlockContainer = null;
let activeBlockInputId = null;
let activeHighlightObserver = null;
let scrollTimer = null;
let pluginLoadTimer = null;
let lifecycleGeneration = 0;
let pluginActive = false;
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
      #${BUTTON_CONTAINER_ID} .bp3-icon:hover { color: #5C7080; }`;
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

const updateButtonState = (container) => {
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
  button.classList.toggle(DOCUMENT_MODE_CLASS, documentMode);
  button.classList.toggle(NO_CHILDREN_CLASS, !treatAsChildren);
  adjustButtonPosition(container, button, versionState, shouldOffset);
};

const adjustButtonPosition = (
  container,
  button,
  versionState,
  shouldOffset,
  defer = true
) => {
  if (!container || !button) return;

  const applyPosition = () => {
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

  if (!defer) {
    applyPosition();
    return;
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(applyPosition);
  } else {
    applyPosition();
  }
};

const stopHighlightObserver = () => {
  if (activeHighlightObserver) {
    activeHighlightObserver.disconnect();
    activeHighlightObserver = null;
  }
};

const removeButton = () => {
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

const extractWindowId = (inputId) => {
  if (!inputId) return null;
  const match = inputId.match(WINDOW_ID_PATTERN);
  return match ? match[1] : null;
};

const focusInsertedBlock = (
  uid,
  windowId,
  lifecycleToken,
  attemptsLeft = MAX_FOCUS_ATTEMPTS
) => {
  if (!uid || attemptsLeft <= 0 || !isCurrentLifecycle(lifecycleToken)) {
    return;
  }

  const textarea =
    document.querySelector(`${BLOCK_INPUT_SELECTOR}[id$='${uid}']`) ||
    document.querySelector(`${BLOCK_INPUT_SELECTOR}[data-uid='${uid}']`);

  const ui = window.roamAlphaAPI?.ui;
  const alreadyFocusedUid =
    ui?.getFocusedBlock?.()?.["block-uid"] ||
    ui?.getFocusedBlock?.()?.uid ||
    null;

  if (alreadyFocusedUid === uid && textarea) {
    return;
  }

  if (!textarea) {
    scheduleFocus(
      () =>
        focusInsertedBlock(uid, windowId, lifecycleToken, attemptsLeft - 1),
      FOCUS_RETRY_DELAY_MS,
      lifecycleToken
    );
    return;
  }

  requestAnimationFrame(() => {
    if (!isCurrentLifecycle(lifecycleToken)) return;
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

    if (ui?.setBlockFocusAndSelection) {
      const targetWindowId =
        windowId ||
        ui.getFocusedBlock?.()?.["window-id"] ||
        null;
      const location = { "block-uid": uid };
      if (targetWindowId) {
        location["window-id"] = targetWindowId;
      }
      try {
        ui.setBlockFocusAndSelection({
          location,
          selection: { start: selectionLength, end: selectionLength },
        });
      } catch (error) {
        /* ignore focus errors */
      }
    }
  });
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
      "[:block/order :block/string {:block/children [:block/uid]} {:block/_children [:block/uid]} {:block/parents [:block/uid]} {:block/page [:block/uid]}]",
      [":block/uid", blockUid]
    );
  } catch (error) {
    console.error("Native Insert Block: Failed to load block data", error);
    return null;
  }
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
  const blockInput = container.querySelector(BLOCK_INPUT_SELECTOR);
  if (!blockInput) return;

  removeButton();

  const blockUid = blockInput.id.slice(-9);
  activeBlockInputId = blockInput.id;
  const windowHint = extractWindowId(blockInput.id);
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

    const focusedWindowId =
      window.roamAlphaAPI.ui?.getFocusedBlock?.()?.["window-id"] || null;
    const lifecycleToken = lifecycleGeneration;

    removeButton();

    if (actionMode === "delete") {
      try {
        await window.roamAlphaAPI.deleteBlock({ block: { uid: blockUid } });
      } catch (error) {
        console.error("Native Insert Block: Failed to delete block", error);
      }
      return;
    }

    const blockData = pullBlockMetadata(blockUid);
    if (!blockData) {
      return;
    }

    let targetParentUid;
    let targetOrder;
    let expandParentAfterInsert = false;

    if (actionMode === "wrap") {
      // Ctrl + Click: Insert Parent
      // 1. Get current parent and order
      const currentParentUid = resolveParentUid(blockData);
      const currentOrder = resolveOrder(blockData);

      if (!currentParentUid || typeof currentOrder !== "number") {
        console.error("Native Insert Block: Could not resolve parent or order for Insert Parent");
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
              lifecycleToken
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
      }
      return;
    }

    if (actionMode === "child") {
      // Cmd + Click: Insert Child
      targetParentUid = blockUid;
      const children = blockData[":block/children"] || blockData["block/children"] || [];
      targetOrder = children.length;
      const bullet = container.querySelector(".rm-bullet");
      expandParentAfterInsert = Boolean(
        bullet?.classList?.contains?.("rm-bullet--closed") ||
        container.classList.contains("rm-block--closed")
      );
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
            lifecycleToken
          ),
        POST_INSERT_FOCUS_DELAY_MS,
        lifecycleToken
      );
    } catch (error) {
      console.error("Native Insert Block: Failed to insert block", error);
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
  const versionState = getVersionState(container);
  const documentMode = isDocumentMode(container);
  const shouldOffset =
    !documentMode && versionState.isVersionBlock && versionState.isCollapsed;
  adjustButtonPosition(
    container,
    buttonContainer,
    versionState,
    shouldOffset,
    false
  );
  buttonContainer.style.visibility = "";
  updateButtonState(container);
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
    updateButtonState(container);
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
    removeButton();
    removeStyles();
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
