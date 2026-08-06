(() => {
const BUTTON_CONTAINER_ID = "native-insert-block-btn-container";
const ACTION_MENU_ID = "native-insert-block-action-menu";
const STYLE_ID = "native-insert-block-styles";
const BLOCK_INPUT_SELECTOR = "[id^='block-input']";
const NO_CHILDREN_CLASS = "native-insert-block-no-children";
const VISIBLE_CLASS = "native-insert-block-visible";
const DOCUMENT_MODE_CLASS = "native-insert-block-document-mode";
const ROAM_HIGHLIGHT_CLASS = "rm-block-highlight";
const TOOLTIP_OPEN_DELAY_MS = 400;
const ACTIONS = Object.freeze({
  ABOVE: "above",
  BELOW: "below",
  CHILD: "child",
  PARENT: "parent",
  DELETE: "delete",
});
const ACTION_DETAILS = Object.freeze([
  { action: ACTIONS.ABOVE, label: "Insert Above", icon: "arrow-up" },
  { action: ACTIONS.BELOW, label: "Insert Below", icon: "arrow-down" },
  { action: ACTIONS.CHILD, label: "Insert Child", icon: "indent" },
  { action: ACTIONS.PARENT, label: "Wrap in Parent", icon: "outdent" },
  { action: ACTIONS.DELETE, label: "Delete Block", icon: "trash" },
]);
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
let activeActionMenu = null;
let activeTriggerRenderer = null;
const focusTimers = new Set();

const isMacPlatform = () => {
  const platform =
    window.navigator?.userAgentData?.platform ||
    window.navigator?.platform ||
    window.navigator?.userAgent ||
    "";
  return /Mac|iPhone|iPad|iPod/i.test(platform);
};

const getModifierTooltip = () =>
  isMacPlatform()
    ? "Click: below · ⌘ child · ⌥ above · ⌃ parent · ⇧ delete"
    : "Click: below · Ctrl child · Alt above · Ctrl+Alt parent · Shift delete";

const resolveAction = (event) => {
  if (event.shiftKey) return ACTIONS.DELETE;
  if (isMacPlatform()) {
    if (event.ctrlKey) return ACTIONS.PARENT;
    if (event.metaKey) return ACTIONS.CHILD;
  } else {
    if (event.ctrlKey && event.altKey) return ACTIONS.PARENT;
    if (event.ctrlKey) return ACTIONS.CHILD;
  }
  if (event.altKey) return ACTIONS.ABOVE;
  return ACTIONS.BELOW;
};

const getActionPresentation = (action) => {
  if (action === ACTIONS.DELETE) {
    return { icon: "trash", label: "Delete block" };
  }
  if (action === ACTIONS.ABOVE) {
    return { icon: "arrow-up", label: "Insert block above" };
  }
  if (action === ACTIONS.CHILD) {
    return { icon: "indent", label: "Insert child block" };
  }
  if (action === ACTIONS.PARENT) {
    return { icon: "outdent", label: "Wrap block in parent" };
  }
  return { icon: "plus", label: "Insert block below" };
};

const scheduleFocus = (callback, delay) => {
  const timer = setTimeout(() => {
    focusTimers.delete(timer);
    callback();
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
      #${BUTTON_CONTAINER_ID}.${DOCUMENT_MODE_CLASS} { top: 2px; }
      #${BUTTON_CONTAINER_ID} .native-insert-block-trigger.bp3-button { min-width: 20px; min-height: 20px; padding: 2px; color: #A7B6C2; border-radius: 2px; box-shadow: none; }
      #${BUTTON_CONTAINER_ID} .native-insert-block-trigger.bp3-button:hover { color: #5C7080; background: rgba(167, 182, 194, 0.15); }
      #${BUTTON_CONTAINER_ID} .native-insert-block-trigger .bp3-icon { color: inherit; }
      #${ACTION_MENU_ID} { position: fixed; z-index: 10000; min-width: 168px; padding: 4px; }
      #${ACTION_MENU_ID} .bp3-menu-item { width: 100%; border: 0; text-align: left; cursor: pointer; }
      #${ACTION_MENU_ID} .native-insert-block-menu-delete { margin-top: 4px; padding-top: 9px; border-top: 1px solid rgba(167, 182, 194, 0.35); color: #C23030; }`;
  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.innerHTML = css;
  document.head.appendChild(styleElement);
};

const removeStyles = () => {
  document.getElementById(STYLE_ID)?.remove();
};

const getOwnBullet = (container) => {
  const blockInput = container?.querySelector?.(BLOCK_INPUT_SELECTOR) || null;
  const blockMain = blockInput?.closest?.(".rm-block-main") || null;
  const controls =
    blockMain?.querySelector?.(".rm-block__controls") ||
    container?.querySelector?.(".rm-block__controls") ||
    null;
  return (
    controls?.querySelector?.(".rm-bullet") ||
    (!controls ? container?.querySelector?.(".rm-bullet") : null) ||
    null
  );
};

const getBulletVisualAnchor = (container) => {
  const bullet = getOwnBullet(container);
  return bullet?.querySelector?.(".rm-bullet__inner") || bullet;
};

const determineChildrenState = (container) => {
  const childrenContainer = container.querySelector(".rm-block-children");
  const hasRenderedChildren =
    childrenContainer && container.querySelector(".roam-block-container");
  const bullet = getOwnBullet(container);
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
    const anchor =
      getBulletVisualAnchor(container) ||
      versionState?.versionBullet ||
      versionState?.caretElement ||
      container.querySelector(BLOCK_INPUT_SELECTOR);
    const anchorRect = anchor?.getBoundingClientRect?.();
    const containerRect = container.getBoundingClientRect?.();
    const measuredButtonRect = button.getBoundingClientRect?.();

    if (
      Number.isFinite(anchorRect?.top) &&
      Number.isFinite(anchorRect?.height) &&
      anchorRect.height > 0 &&
      Number.isFinite(containerRect?.top) &&
      Number.isFinite(measuredButtonRect?.height) &&
      measuredButtonRect.height > 0
    ) {
      const centeredTop =
        anchorRect.top -
        containerRect.top +
        anchorRect.height / 2 -
        measuredButtonRect.height / 2;
      button.style.top = `${Math.round(centeredTop)}px`;
      return;
    }

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

const removeActionMenu = () => {
  if (activeActionMenu) {
    activeActionMenu.remove();
    activeActionMenu = null;
  } else {
    document.getElementById(ACTION_MENU_ID)?.remove();
  }
};

const removeButton = () => {
  stopHighlightObserver();
  removeActionMenu();
  activeTriggerRenderer = null;
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

const focusInsertedBlock = (uid, windowId, attemptsLeft = MAX_FOCUS_ATTEMPTS) => {
  if (!uid || attemptsLeft <= 0) {
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
      () => focusInsertedBlock(uid, windowId, attemptsLeft - 1),
      FOCUS_RETRY_DELAY_MS
    );
    return;
  }

  requestAnimationFrame(() => {
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
      "[:block/order {:block/children [:block/uid]} {:block/_children [:block/uid]} {:block/parents [:block/uid]} {:block/page [:block/uid]}]",
      [":block/uid", blockUid]
    );
  } catch (error) {
    console.error("Native Insert Block: Failed to load block data", error);
    return null;
  }
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

  const executeAction = async (action, e) => {
    e.preventDefault();
    e.stopPropagation();

    const focusedWindowId =
      window.roamAlphaAPI.ui?.getFocusedBlock?.()?.["window-id"] || null;

    removeButton();

    if (action === ACTIONS.DELETE) {
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

    if (action === ACTIONS.PARENT) {
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
          () => focusInsertedBlock(newParentUid, windowHint || focusedWindowId),
          POST_INSERT_FOCUS_DELAY_MS
        );
      } catch (error) {
        if (parentCreated) {
          const latestBlockData = pullBlockMetadata(blockUid);
          const latestParentUid = resolveParentUid(latestBlockData);
          if (latestBlockData && latestParentUid !== newParentUid) {
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

    if (action === ACTIONS.CHILD) {
      targetParentUid = blockUid;
      const children =
        blockData[":block/children"] || blockData["block/children"] || [];
      targetOrder = children.length;
      const bullet = getOwnBullet(container);
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

      if (action === ACTIONS.ABOVE) {
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
        () => focusInsertedBlock(newUid, windowHint || focusedWindowId),
        POST_INSERT_FOCUS_DELAY_MS
      );
    } catch (error) {
      console.error("Native Insert Block: Failed to insert block", error);
    }
  };

  const handleInsertClick = (e) => executeAction(resolveAction(e), e);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeActionMenu();

    const menu = document.createElement("div");
    menu.id = ACTION_MENU_ID;
    menu.className = "bp3-menu bp3-elevation-2";
    menu.role = "menu";
    menu.setAttribute("aria-label", "Block actions");

    for (const { action, label, icon } of ACTION_DETAILS) {
      const item = document.createElement("button");
      item.type = "button";
      item.role = "menuitem";
      item.textContent = label;
      item.className = `bp3-menu-item bp3-icon-${icon}`;
      if (action === ACTIONS.DELETE) {
        item.className += " native-insert-block-menu-delete";
      }
      item.addEventListener("click", (event) => {
        removeActionMenu();
        return executeAction(action, event);
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);
    activeActionMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(
      4,
      Math.min(
        e.clientX,
        Math.max(
          4,
          (viewportWidth || e.clientX + menuRect.width) - menuRect.width - 4
        )
      )
    );
    const top = Math.max(
      4,
      Math.min(
        e.clientY,
        Math.max(
          4,
          (viewportHeight || e.clientY + menuRect.height) - menuRect.height - 4
        )
      )
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  const renderTrigger = (action = ACTIONS.BELOW) => {
    const presentation = getActionPresentation(action);
    const buttonElement = window.React.createElement(
      window.Blueprint.Core.Tooltip,
      {
        content: getModifierTooltip(),
        hoverOpenDelay: TOOLTIP_OPEN_DELAY_MS,
        interactionKind: "hover-target-only",
        popoverClassName: "native-insert-block-tooltip",
        position: "top",
      },
      window.React.createElement(window.Blueprint.Core.Button, {
        "aria-label": presentation.label,
        className: "native-insert-block-trigger",
        icon: presentation.icon,
        minimal: true,
        small: true,
        onClick: handleInsertClick,
        onContextMenu: handleContextMenu,
      })
    );
    window.ReactDOM.render(buttonElement, buttonContainer);
  };

  container.appendChild(buttonContainer);
  activeTriggerRenderer = renderTrigger;
  renderTrigger();
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
  if (
    activeBlockContainer &&
    e.target.closest?.(".native-insert-block-tooltip")
  ) {
    return;
  }
  const container = e.target.closest(".roam-block-container");
  if (
    activeActionMenu &&
    (!container || container === activeBlockContainer)
  ) {
    return;
  }
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

const handleBlockInteraction = (e) => {
  if (activeActionMenu) {
    if (e.target.closest?.(`#${ACTION_MENU_ID}`)) return;
    removeActionMenu();
  }
  if (!activeBlockContainer) return;
  if (e.target.closest(`#${BUTTON_CONTAINER_ID}`)) return;
  if (activeBlockContainer.contains(e.target)) {
    removeButton();
  }
};

const handleKeyDown = (e) => {
  if (e.key === "Escape") {
    removeActionMenu();
    return;
  }
  if (["Alt", "Control", "Meta", "Shift"].includes(e.key)) {
    activeTriggerRenderer?.(resolveAction(e));
    return;
  }
  if (activeBlockInputId && e.target.id === activeBlockInputId) {
    removeButton();
  }
};

const handleKeyUp = (e) => {
  if (["Alt", "Control", "Meta", "Shift"].includes(e.key)) {
    activeTriggerRenderer?.(resolveAction(e));
  }
};

const handlePointerLeaveViewport = (e) => {
  if (e.target === document.documentElement && !e.relatedTarget) {
    removeButton();
  }
};

const handleScroll = () => {
  removeActionMenu();
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    removeButton();
    scrollTimer = null;
  }, SCROLL_THROTTLE_MS);
};

const mainApp = {
  init() {
    addStyles();
    document.addEventListener("pointermove", handlePointerMove, true);
    document.documentElement.addEventListener(
      "pointerleave",
      handlePointerLeaveViewport
    );
    document.addEventListener("pointerdown", handleBlockInteraction, true);
    document.addEventListener("focusin", handleBlockInteraction, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("scroll", handleScroll, true);
  },
  destroy() {
    removeButton();
    removeStyles();
    clearFocusTimers();
    document.removeEventListener("pointermove", handlePointerMove, true);
    document.documentElement.removeEventListener(
      "pointerleave",
      handlePointerLeaveViewport
    );
    document.removeEventListener("pointerdown", handleBlockInteraction, true);
    document.removeEventListener("focusin", handleBlockInteraction, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("keyup", handleKeyUp, true);
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
  if (window.nativeInsertBlockPlugin) {
    window.nativeInsertBlockPlugin.destroy();
    delete window.nativeInsertBlockPlugin;
  }
  // Unload legacy global names left by earlier releases.
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
