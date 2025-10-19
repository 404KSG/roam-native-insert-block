(() => {
    // --- 常量定义 ---
    const BUTTON_CONTAINER_ID = "quick-insert-btn-container";
    const STYLE_ID = "quick-insert-styles";
    const BLOCK_INPUT_SELECTOR = "[id^='block-input']";
    const NO_CHILDREN_CLASS = "quick-insert-no-children";
    const VISIBLE_CLASS = "quick-insert-visible";
    const ROAM_HIGHLIGHT_CLASS = "rm-block-highlight";
    const DEFAULT_BUTTON_SIZE = 24;
    const WINDOW_ID_PATTERN = /^block-input-(.+)-([a-zA-Z0-9_-]{9})$/;
    const MAX_FOCUS_ATTEMPTS = 30;

    // 优化的延迟和节流时间
    const FOCUS_RETRY_DELAY_MS = 60;
    const POST_INSERT_FOCUS_DELAY_MS = 80;
    const PLUGIN_LOAD_RETRY_MS = 500;
    const SCROLL_THROTTLE_MS = 100;

    // --- 状态变量 ---
    let activeBlockContainer = null;
    let activeBlockInputId = null;
    let activeBlockWindowId = null;
    let activeHighlightObserver = null;
    let scrollTimer = null; // 用于滚动节流

    // --- 样式管理 ---
    const addStyles = () => {
        if (document.getElementById(STYLE_ID)) return;
        const css = `.roam-block-container { position: relative; }
          #${BUTTON_CONTAINER_ID} { display: none; justify-content: center; align-items: center; position: absolute; top: 18px; left: 0; height: ${DEFAULT_BUTTON_SIZE}px; width: ${DEFAULT_BUTTON_SIZE}px; z-index: 99; pointer-events: auto; }
          #${BUTTON_CONTAINER_ID}.${VISIBLE_CLASS} { display: flex; }
          #${BUTTON_CONTAINER_ID}.${NO_CHILDREN_CLASS} { top: calc(1em - ${DEFAULT_BUTTON_SIZE / 2}px); }
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

    // --- DOM & 状态辅助函数 ---
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
        activeBlockWindowId = null;
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
        if (!inputId) {
            return null;
        }
        const match = inputId.match(WINDOW_ID_PATTERN);
        return match ? match[1] : null;
    };

    // --- 核心逻辑：聚焦 & 数据拉取 ---
    const focusInsertedBlock = (uid, windowId, attemptsLeft = MAX_FOCUS_ATTEMPTS) => {
        if (!uid || attemptsLeft <= 0) {
            return;
        }

        const textarea =
            document.querySelector(`${BLOCK_INPUT_SELECTOR}[id$='${uid}']`) ||
            document.querySelector(`${BLOCK_INPUT_SELECTOR}[data-uid='${uid}']`);

        if (!textarea) {
            setTimeout(() => focusInsertedBlock(uid, windowId, attemptsLeft - 1), FOCUS_RETRY_DELAY_MS);
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

            const ui = window.roamAlphaAPI?.ui;
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

    // 优化：辅助函数，安全地从 Roam API 返回的对象中提取 UID
    const getNestedUid = (obj) => {
        if (!obj) return null;
        return obj?.[":block/uid"] ?? obj?.["block/uid"] ?? obj?.uid ?? null;
    };

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
                "[:block/order {:block/_children [:block/uid]} {:block/parents [:block/uid]} {:block/page [:block/uid]}]",
                [":block/uid", blockUid]
            );
        } catch (error) {
            console.error("Native Insert Block: Failed to load block data", error);
            return null;
        }
    };

    // 优化：使用 ?? 和 getNestedUid 辅助函数
    const resolveParentUid = (blockData) => {
        if (!blockData) {
            return null;
        }

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

    // 优化：使用 ?? 安全处理 order 为 0 的情况
    const resolveOrder = (blockData) => {
        if (!blockData) {
            return null;
        }
        const order =
            blockData[":block/order"] ??
            blockData["block/order"] ??
            blockData.order ??
            null;
        
        return typeof order === "number" ? order : null;
    };

    // --- 核心逻辑：按钮渲染与插入 ---
    const renderButton = (container) => {
        if (!window.React || !window.ReactDOM || !window.roamAlphaAPI) return;
        const blockInput = container.querySelector(BLOCK_INPUT_SELECTOR);
        if (!blockInput) return;

        removeButton();

        const blockUid = blockInput.id.slice(-9);
        activeBlockInputId = blockInput.id;
        activeBlockWindowId = extractWindowId(blockInput.id);
        const buttonContainer = document.createElement("div");
        buttonContainer.id = BUTTON_CONTAINER_ID;

        const handleInsertClick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const windowHint = activeBlockWindowId;
            const focusedWindowId =
                window.roamAlphaAPI.ui?.getFocusedBlock?.()?.["window-id"] || null;

            removeButton();

            const blockData = pullBlockMetadata(blockUid);
            if (!blockData) {
                return;
            }

            const parentUid = resolveParentUid(blockData);
            const blockOrder = resolveOrder(blockData);

            if (!parentUid || typeof blockOrder !== "number") {
                console.error(
                    "Native Insert Block: Could not resolve parent or order",
                    blockUid,
                    blockData
                );
                return;
            }

            const newUid = window.roamAlphaAPI.util.generateUID();
            try {
                await window.roamAlphaAPI.createBlock({
                    location: { "parent-uid": parentUid, order: blockOrder + 1 },
                    block: { string: "", uid: newUid },
                });
                const windowIdForFocus = windowHint || focusedWindowId || null;
                setTimeout(() => focusInsertedBlock(newUid, windowIdForFocus), POST_INSERT_FOCUS_DELAY_MS);
            } catch (error) {
                console.error("Native Insert Block: Failed to insert block", error);
            }
        };

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

    // --- 事件监听器 ---
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

    // 优化：节流的滚动处理
    const handleScroll = () => {
        if (scrollTimer) return; // 如果计时器已存在，则不执行

        // 设置计时器
        scrollTimer = setTimeout(() => {
            removeButton();
            scrollTimer = null; // 执行后清除计时器
        }, SCROLL_THROTTLE_MS);
    };

    // --- 插件主对象与生命周期 ---
    const mainApp = {
        init() {
            addStyles();
            document.addEventListener("pointermove", handlePointerMove, true);
            document.documentElement.addEventListener(
                "pointerleave",
                handlePointerLeaveViewport
            );
            document.addEventListener("pointerdown", handlePointerDown, true);
            document.addEventListener("focusin", handleFocusIn, true);
            document.addEventListener("keydown", handleKeyDown, true);
            document.addEventListener("scroll", handleScroll, true);
        },
        destroy() {
            removeButton();
            removeStyles();
            document.removeEventListener("pointermove", handlePointerMove, true);
            document.documentElement.removeEventListener(
                "pointerleave",
                handlePointerLeaveViewport
            );
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("focusin", handleFocusIn, true);
            document.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("scroll", handleScroll, true);
            
            // 确保在卸载时清除任何待处理的计时器
            if (scrollTimer) {
                clearTimeout(scrollTimer);
                scrollTimer = null;
            }
        },
    };

    const loadPlugin = () => {
        if (
            window.roamAlphaAPI &&
            window.React &&
            window.ReactDOM &&
            window.Blueprint
        ) {
            mainApp.init();
        } else {
            setTimeout(loadPlugin, PLUGIN_LOAD_RETRY_MS);
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
