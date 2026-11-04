/* Owned fixture only. It models native row-local caret hover; no graph is opened. */
(async () => {
  const mode = new URLSearchParams(location.search).get("mode") || "depot";
  const calls = [], records = new Map();
  let nextUid = 0;
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  window.React = { createElement: (component, props) => ({ component, props }) };
  window.Blueprint = { Core: { Icon() {} } };
  window.ReactDOM = {
    render({ props }, target) {
      const icon = document.createElement("span");
      icon.className = "bp3-icon bp3-icon-plus";
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5"/></svg>';
      for (const [type, callback] of [["click", props.onClick], ["mousedown", props.onMouseDown], ["contextmenu", props.onContextMenu]]) {
        if (callback) icon.addEventListener(type, callback);
      }
      target.replaceChildren(icon);
    },
    unmountComponentAtNode(target) { target.replaceChildren(); },
  };
  window.roamAlphaAPI = {
    data: { pull: (_query, lookup) => copy(records.get(lookup[1])) || null },
    util: { generateUID: () => `fixture-created-${++nextUid}` },
    ui: {
      getFocusedBlock: () => document.activeElement?.dataset?.blockUid
        ? { "block-uid": document.activeElement.dataset.blockUid, "window-id": document.activeElement.dataset.windowId }
        : null,
      setBlockFocusAndSelection: async value => calls.push({ type: "focus", value: copy(value) }),
    },
    createBlock: async value => calls.push({ type: "create", value: copy(value) }),
    deleteBlock: async value => calls.push({ type: "delete", value: copy(value) }),
    moveBlock: async value => calls.push({ type: "move", value: copy(value) }),
    updateBlock: async value => calls.push({ type: "update", value: copy(value) }),
  };

  const button = () => document.querySelector("#native-insert-block-btn-container");
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const centerY = element => { const r = element.getBoundingClientRect(); return r.top + r.height / 2; };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  function reset() {
    window.nativeInsertBlockPlugin?.destroy();
    document.querySelector("#main-fixtures").replaceChildren();
    document.querySelector("#sidebar-fixtures").replaceChildren();
    calls.length = 0; records.clear(); nextUid = 0;
    records.set("fixture-page", { ":block/uid": "fixture-page", ":node/title": "Fixture page" });
    window.nativeInsertBlockPlugin?.init();
  }

  function createCase({ name, scope = "ordinary", caret = "hidden", children = true, documentMode = false, version = false, uid = "fixture-shared-root" } = {}) {
    const sidebar = scope === "sidebar-root";
    const mount = document.querySelector(sidebar ? "#sidebar-fixtures" : "#main-fixtures");
    const shell = document.createElement("div");
    if (documentMode) shell.className = "rm-block--document";
    const context = document.createElement("div");
    if (scope === "reference") context.className = "rm-inline-reference";
    const wrapper = document.createElement("div");
    wrapper.className = ["main-root", "sidebar-root", "reference"].includes(scope)
      ? "rm-zoom-block-wrapper"
      : scope === "descendant" ? "rm-block-children rm-block__children rm-level-1" : "rm-block-children rm-block__children rm-level-0";
    const container = document.createElement("div");
    container.className = "roam-block-container";
    container.dataset.blockUid = uid;
    const row = document.createElement("div"); row.className = "rm-block-main";
    const controls = document.createElement("span"); controls.className = "rm-block__controls";
    let nativeCaret = null;
    if (caret !== "absent") {
      const expand = document.createElement("span"); expand.className = "block-expand";
      nativeCaret = document.createElement("span");
      nativeCaret.className = `rm-caret rm-caret-open ${caret === "showing" ? "rm-caret-showing" : "rm-caret-hidden"}`;
      expand.append(nativeCaret); controls.append(expand);
    }
    const bullet = document.createElement("span"); bullet.className = children ? "rm-bullet rm-bullet--closed" : "rm-bullet";
    const dot = document.createElement("span"); dot.className = "rm-bullet__inner"; bullet.append(dot); controls.append(bullet);
    const input = document.createElement("textarea");
    input.className = "rm-block-input"; input.rows = 1; input.value = `${scope} same-UID parent`;
    input.id = `block-input-native-window-${uid}`; input.dataset.blockUid = uid; input.dataset.windowId = "native-window";
    row.append(controls, input); container.append(row);
    if (version) row.append(Object.assign(document.createElement("span"), { className: "rm-version-choice-wrapper" }));
    if (children) container.append(Object.assign(document.createElement("div"), { className: "rm-block-children" }));
    if (nativeCaret && scope !== "main-root") {
      row.addEventListener("mouseenter", () => nativeCaret.className = "rm-caret rm-caret-open rm-caret-showing");
      row.addEventListener("mouseleave", () => nativeCaret.className = "rm-caret rm-caret-open rm-caret-hidden");
    }
    wrapper.append(container); context.append(wrapper); shell.append(context); mount.append(shell);
    records.set(uid, { ":block/uid": uid, ":block/string": input.value, ":block/order": 0, ":block/children": children ? [{ ":block/uid": `${uid}-child` }] : [], ":block/_children": [{ ":block/uid": "fixture-page" }] });
    return { name, scope, shell, context, wrapper, container, row, nativeCaret, bullet, dot, input };
  }

  async function hover(scene) {
    scene.row.dispatchEvent(new MouseEvent("mouseenter"));
    scene.row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await frames();
  }

  function probe(scene) {
    const control = button();
    const caretRect = scene.nativeCaret?.getBoundingClientRect();
    const nativeHit = caretRect && scene.nativeCaret.contains(document.elementFromPoint(caretRect.left + caretRect.width / 2, caretRect.top + caretRect.height / 2));
    return {
      scope: scene.scope,
      inline: control?.classList.contains("native-insert-block-no-children") || false,
      control: control ? rect(control) : null,
      bullet: rect(scene.dot),
      centerDelta: control ? centerY(control) - centerY(scene.dot) : null,
      nativeCaretClass: scene.nativeCaret?.className || "absent",
      nativeCaretHit: Boolean(nativeHit),
    };
  }

  async function run() {
    reset();
    const scenes = [
      createCase({ name: "main root", scope: "main-root" }),
      createCase({ name: "sidebar twin", scope: "sidebar-root" }),
      createCase({ name: "focused descendant", scope: "descendant" }),
      createCase({ name: "ordinary parent", scope: "ordinary" }),
      createCase({ name: "reference copy", scope: "reference" }),
    ];
    const results = [];
    for (const scene of scenes) {
      await hover(scene);
      const result = probe(scene); results.push(result);
      if (scene.scope === "main-root") {
        assert(result.inline, "verified main focused root must use its own Bullet row");
        assert(result.nativeCaretClass.includes("rm-caret-hidden"), "main root native caret must remain hidden after row hover");
        assert(Math.abs(result.centerDelta) < .5, "main root plus must center on own Bullet");
      } else {
        assert(!result.inline, `${scene.scope} must retain published parent clearance`);
        assert(result.nativeCaretClass.includes("rm-caret-showing"), `${scene.scope} must model native row-local hover`);
        assert(result.nativeCaretHit, `${scene.scope} native caret hit target must remain reachable`);
      }
    }
    return { mode, passed: true, results, calls: [...calls] };
  }

  const fixture = window.__nativeLayoutFixture = { ready: false, reset, createCase, hover, probe, run, calls };
  if (mode === "roamjs") await new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = "/roamjs.js"; script.onload = resolve; script.onerror = reject; document.body.append(script);
  }); else {
    const module = await import("/extension.js"); module.default.onload();
  }
  const show = async scope => {
    reset(); fixture.current = createCase({ name: scope, scope }); await hover(fixture.current);
    document.querySelector("#results").textContent = JSON.stringify(probe(fixture.current), null, 2);
  };
  document.querySelector("#run-layout").addEventListener("click", () => run().then(result => document.querySelector("#results").textContent = JSON.stringify(result, null, 2)).catch(error => document.querySelector("#results").textContent = error.stack));
  document.querySelector("#show-main-root").addEventListener("click", () => show("main-root"));
  document.querySelector("#show-sidebar").addEventListener("click", () => show("sidebar-root"));
  document.querySelector("#show-descendant").addEventListener("click", () => show("descendant"));
  await show("main-root"); fixture.ready = true;
})().catch(error => { document.querySelector("#results").textContent = error.stack; window.__nativeLayoutLoadError = error.message; });
