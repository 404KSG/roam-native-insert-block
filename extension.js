(() => {
  const BUTTON_CONTAINER_ID = "quick-insert-btn-container";
  const STYLE_ID = "quick-insert-styles";
  const BLOCK_INPUT_SELECTOR = "[id^='block-input']";
  const NO_CHILDREN_CLASS = "quick-insert-no-children";
  const VISIBLE_CLASS = "quick-insert-visible";
  const ROAM_HIGHLIGHT_CLASS = "rm-block-highlight"; // [!!] Roam 用于标记“选中/编辑”状态的 class
  let activeBlockContainer = null;
  let activeBlockInputId = null;
  let activeHighlightObserver = null;

  const addStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const css = `.roam-block-container { position: relative; }
     #${BUTTON_CONTAINER_ID} { display: none; justify-content: center; align-items: center; position: absolute; top: 18px; left: 0; height: 24px; width: 24px; z-index: 99; pointer-events: auto; }
     #${BUTTON_CONTAINER_ID}.${VISIBLE_CLASS} { display: flex; }
     
     /* [!!] 修改点：将 top: 4px; 替换为 calc(1em - 12px); */
     #${BUTTON_CONTAINER_ID}.${NO_CHILDREN_CLASS} { top: calc(1em - 12px); }
     
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

  const updateButtonState = (container) => {
    const button = document.getElementById(BUTTON_CONTAINER_ID);
    if (!button) return;
    button.classList.toggle(NO_CHILDREN_CLASS, !determineChildrenState(container));
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
    if (button && window.ReactDOM?.unmountComponentAtNode) {
      try {
        window.ReactDOM.unmountComponentAtNode(button);
      } catch (e) {
        /* ignore */
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

  const renderButton = (container) => {
    if (!window.React || !window.ReactDOM || !window.roamAlphaAPI) return;
    const blockInput = container.querySelector(BLOCK_INPUT_SELECTOR);
    if (!blockInput) return;

    removeButton();

    const blockUid = blockInput.id.slice(-9);
    activeBlockInputId = blockInput.id;
    const buttonContainer = document.createElement("div");
    buttonContainer.id = BUTTON_CONTAINER_ID;

    // [!!] 修改点：重写了整个 handleInsertClick 的数据查询逻辑
    const handleInsertClick = async (e) => {
      e.stopPropagation();
      removeButton();

      // 使用 data.pull 和反向查找 :block/_children 来精确定位 *直接* 父级
      // 1. "[:block/order ...]" - 获取当前 block 的 order
      // 2. "{:block/_children [:block/uid]}" - 获取拥有此 block 作为 child 的父级，并只要父级的 uid
      const blockData = window.roamAlphaAPI.data.pull(
        "[:block/order {:block/_children [:block/uid]}]",
        [":block/uid", blockUid]
      );

      // 健壮性检查
      if (!blockData || !blockData[":block/_children"] || blockData[":block/_children"].length === 0) {
        console.error("Native Insert Block: Could not find parent for block:", blockUid);
        return;
      }
      
      const blockOrder = blockData[":block/order"];
      // [0] 确保我们拿到的是唯一的直接父级
      const parentUid = blockData[":block/_children"][0][":block/uid"]; 

      if (!parentUid) {
           console.error("Native Insert Block: Parent has no UID:", blockData[":block/_children"][0]);
           return;
      }

      const newUid = window.roamAlphaAPI.util.generateUID();
      
      // 现在 parent-uid 和 order 都是绝对正确的
      await window.roamAlphaAPI.createBlock({
        location: { "parent-uid": parentUid, order: blockOrder + 1 },
        block: { string: "", uid: newUid },
      });

      setTimeout(() => {
        const focusedWindowId =
          window.roamAlphaAPI.ui.getFocusedBlock()?.["window-id"];
        if (focusedWindowId) {
          window.roamAlphaAPI.ui.setBlockFocusAndSelection({
            location: { "block-uid": newUid, "window-id": focusedWindowId },
          });
        }
      }, 100);
    };
    // [!!] 修改结束

    const buttonElement = window.React.createElement(window.Blueprint.Core.Icon, {
      icon: "plus",
      size: 12,
      onClick: handleInsertClick,
    });

    container.appendChild(buttonContainer);
    window.ReactDOM.render(buttonElement, buttonContainer);
    buttonContainer.classList.add(VISIBLE_CLASS);
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

  const handlePointerDown = (e) => {
    if (!activeBlockContainer) return;
    if (e.target.closest(`#${BUTTON_CONTAINER_ID}`)) return;
    if (activeBlockContainer.contains(e.target)) {
      removeButton();
    }
  };

  const handleFocusIn = (e) => {
    if (!activeBlockContainer) return;
    if (e.target.closest(`#${BUTTON_CONTAINER_ID}`)) return;
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

  const handleScroll = () => removeButton();

  const mainApp = {
    init() {
      addStyles();
      document.addEventListener("pointermove", handlePointerMove, true);
      document.documentElement.addEventListener("pointerleave", handlePointerLeaveViewport);
      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("focusin", handleFocusIn, true);
      document.addEventListener("keydown", handleKeyDown, true);
      document.addEventListener("scroll", handleScroll, true);
    },
    destroy() {
      removeButton();
      removeStyles();
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeaveViewport);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("scroll", handleScroll, true);
    },
  };

  const loadPlugin = () => {
    if (window.roamAlphaAPI && window.React && window.ReactDOM && window.Blueprint) {
      mainApp.init();
    } else {
      setTimeout(loadPlugin, 500);
    }
  };

  const unloadExisting = () => {
    if (window.quickInsertPlugin) {
      window.quickInsertPlugin.destroy();
    }
    if (window.quickInsertBlockV15) {
      window.quickInsertBlockV15.destroy();
    }
  };

  unloadExisting();
  loadPlugin();
  window.quickInsertPlugin = mainApp;
})();
