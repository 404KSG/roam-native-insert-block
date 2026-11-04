/* Owned fixture only. It models native row-local caret hover; no graph is opened. */
(async () => {
  const mode = new URLSearchParams(location.search).get("mode") || "depot";
  const calls = [], nativeToggles = [], errors = [], records = new Map();
  let nextUid = 0;
  window.addEventListener("error", event => errors.push(event.error?.message || event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason?.message || event.reason)));
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
    document.querySelector("#unknown-fixtures").replaceChildren();
    calls.length = 0; nativeToggles.length = 0; records.clear(); nextUid = 0;
    records.set("fixture-page", { ":block/uid": "fixture-page", ":node/title": "Fixture page" });
    window.nativeInsertBlockPlugin?.init();
  }

  function createCase({ name, scope = "ordinary", caret = "hidden", children = true, collapsed = false, documentMode = false, version = false, uid = "fixture-shared-root" } = {}) {
    const mount = document.querySelector(scope === "sidebar-root" ? "#sidebar-fixtures" : scope === "unknown" ? "#unknown-fixtures" : "#main-fixtures");
    const shell = document.createElement("div");
    if (documentMode) shell.className = "rm-block--document";
    const article = document.createElement("div"); article.className = "roam-article";
    const context = document.createElement("div");
    const exclusions = { reference: "rm-inline-reference", embed: "rm-embed-container", query: "roam-query", mentions: "rm-mentions", desk: "rm-desk-outline" };
    context.className = exclusions[scope] || "";
    const wrapper = document.createElement("div");
    wrapper.className = scope === "ordinary" ? "rm-block-children rm-block__children rm-level-0"
      : scope === "descendant" ? "rm-block-children rm-block__children rm-level-1" : "rm-zoom-block-wrapper";
    const container = document.createElement("div"); container.className = "roam-block-container"; container.dataset.blockUid = uid;
    const row = document.createElement("div"); row.className = "rm-block-main";
    const controls = document.createElement("span"); controls.className = "rm-block__controls";
    let nativeCaret = null, expand = null, childHost = null, isCollapsed = collapsed;
    const canCollapse = children && (scope !== "main-root" || caret === "showing") && caret !== "unknown";
    const paintCaret = showing => {
      if (!nativeCaret || caret === "unknown") return;
      nativeCaret.className = `rm-caret ${isCollapsed ? "rm-caret-closed" : "rm-caret-open"} ${showing && canCollapse ? "rm-caret-showing" : "rm-caret-hidden"}`;
    };
    if (caret !== "absent") {
      expand = document.createElement("span"); expand.className = "block-expand";
      nativeCaret = document.createElement("span"); nativeCaret.className = "rm-caret";
      paintCaret(caret === "showing"); expand.append(nativeCaret); controls.append(expand);
    }
    const bullet = document.createElement("span"); bullet.className = `rm-bullet${collapsed ? " rm-bullet--closed" : ""}`;
    const dot = document.createElement("span"); dot.className = "rm-bullet__inner"; bullet.append(dot); controls.append(bullet);
    const input = document.createElement("textarea"); input.className = "rm-block-input"; input.rows = 1; input.value = "Shared parent block";
    const windowId = `native-view-${scope}`;
    input.id = `block-input-${windowId}-${uid}`; input.dataset.blockUid = uid; input.dataset.windowId = windowId;
    row.append(controls, input); container.append(row);
    if (version) row.append(Object.assign(document.createElement("span"), { className: "rm-version-choice-wrapper" }));
    if (children) {
      childHost = document.createElement("div"); childHost.className = "rm-block-children rm-block__children rm-level-1"; childHost.hidden = collapsed;
      const child = document.createElement("div"); child.className = "roam-block-container"; child.dataset.blockUid = `${uid}-child`;
      child.innerHTML = '<div class="rm-block-main"><span class="rm-block__controls"><span class="rm-bullet"><span class="rm-bullet__inner"></span></span></span><span class="child-label">Child block</span></div>';
      childHost.append(child); container.append(childHost);
    }
    const blank = document.createElement("div"); blank.className = "parent-body"; blank.textContent = "Parent body outside its native row"; container.append(blank);
    row.addEventListener("mouseenter", () => paintCaret(true));
    row.addEventListener("mouseleave", () => paintCaret(false));
    if (expand && canCollapse) expand.addEventListener("click", () => {
      isCollapsed = !isCollapsed; bullet.classList.toggle("rm-bullet--closed", isCollapsed);
      if (childHost) childHost.hidden = isCollapsed;
      nativeToggles.push({ uid, scope, collapsed: isCollapsed }); paintCaret(true);
    });
    wrapper.append(container);
    if (scope === "descendant") {
      const outerZoom = document.createElement("div"); outerZoom.className = "rm-zoom-block-wrapper";
      const outerBlock = document.createElement("div"); outerBlock.className = "roam-block-container"; outerBlock.dataset.blockUid = "fixture-focused-ancestor";
      outerBlock.append(wrapper); outerZoom.append(outerBlock); context.append(outerZoom);
    } else context.append(wrapper);
    article.append(context); shell.append(article); mount.append(shell);
    records.set(uid, { ":block/uid": uid, ":block/string": input.value, ":block/order": 0, ":block/children": children ? [{ ":block/uid": `${uid}-child` }] : [], ":block/_children": [{ ":block/uid": "fixture-page" }] });
    return { name, scope, shell, article, context, wrapper, container, row, nativeCaret, expand, bullet, dot, input, childHost, blank };
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
    const results = [];
    const check = async (name, callback) => {
      const errorOffset = errors.length; reset();
      try { const detail = await callback(); assert(errors.length === errorOffset, errors.slice(errorOffset).join('; ')); results.push({ name, ok: true, detail }); }
      catch (error) { results.push({ name, ok: false, error: error.message }); }
    };
    for (const scope of ["main-root", "sidebar-root", "descendant", "ordinary", "reference", "embed", "query", "mentions", "desk", "unknown"]) {
      await check(`${scope}: positive main-root exception only`, async () => {
        const scene = createCase({ scope }); scene.input.focus(); await hover(scene); const p = probe(scene), b = button();
        assert(p.inline === (scope === 'main-root'), 'Wrong scope branch');
        assert(p.control.width === 24 && p.control.height === 24, 'Hitbox changed');
        assert(b.getBoundingClientRect().right <= scene.dot.getBoundingClientRect().left + .1, 'Control overlaps the native Bullet');
        if (scope === 'main-root') {
          assert(p.nativeCaretClass.includes('rm-caret-hidden') && Math.abs(p.centerDelta) < .5, 'Main root did not keep its own Bullet row');
        } else {
          assert(p.nativeCaretClass.includes('rm-caret-showing') && p.nativeCaretHit, 'Native caret hover/hit target was not preserved');
          assert(getComputedStyle(b).top === '18px', 'Ordinary parent drifted from the published baseline');
        }
        assert(calls.length === 0, 'Layout caused a graph action'); return p;
      });
    }
    await check('same-UID main and sidebar twins never share placement', async () => {
      const main = createCase({ scope: 'main-root' }), side = createCase({ scope: 'sidebar-root' });
      assert(main.container.dataset.blockUid === side.container.dataset.blockUid && main.input.id !== side.input.id, 'Twin identities are not realistic');
      const sequence = [];
      for (const scene of [main, side, main, side]) { scene.input.focus(); await hover(scene); const p = probe(scene); sequence.push(p); assert(p.inline === (scene === main), 'Placement leaked between panes'); }
      return sequence;
    });
    for (const caret of ['absent', 'showing', 'unknown']) await check(`main root with ${caret} own caret`, async () => {
      const scene = createCase({ scope: 'main-root', caret }); await hover(scene);
      assert(probe(scene).inline === (caret === 'absent'), 'Unknown/showing caret was classified as an absent control'); return probe(scene);
    });
    await check('leaf, Document Mode and Version Block retain baseline classes', async () => {
      const results = [];
      for (const options of [{ children: false }, { documentMode: true }, { version: true, collapsed: true }]) {
        reset(); const scene = createCase({ scope: 'main-root', ...options }); await hover(scene); const p = probe(scene); results.push(p);
        if (options.version) assert(!p.inline, 'Version Block took the root exception');
        else assert(p.inline, 'Baseline inline class was lost');
        if (options.documentMode) assert(button().style.top === '' && getComputedStyle(button()).top === '1px', 'Document Mode lost its CSS baseline');
      }
      return results;
    });
    for (const [name, mutate] of [
      ['wrapper class removal', s => s.wrapper.classList.remove('rm-zoom-block-wrapper')],
      ['whole wrapper moves to sidebar', s => document.querySelector('#sidebar-fixtures').append(s.wrapper)],
      ['article moves to sidebar', s => document.querySelector('#sidebar-fixtures').append(s.article)],
      ['ancestor becomes an excluded reference', s => s.context.classList.add('rm-inline-reference')],
      ['ancestor ID becomes sidebar', s => s.article.id = 'right-sidebar'],
      ['whole focused subtree detaches', s => s.shell.remove()],
      ['detach/reinsert before observer delivery', s => { s.wrapper.remove(); document.querySelector('#sidebar-fixtures').append(s.wrapper); }],
      ['own caret becomes showing', s => s.nativeCaret.className = 'rm-caret rm-caret-open rm-caret-showing'],
    ]) await check(`${name}: actual observer delivery clears the special control`, async () => {
      const scene = createCase({ scope: 'main-root' }); await hover(scene); assert(probe(scene).inline, 'Test did not start with the exception');
      mutate(scene); await frames();
      assert(!button() && !scene.container.querySelector('#native-insert-block-btn-container'), 'Stale special control survived a real DOM mutation');
      assert(calls.length === 0, 'Invalidation mutated the graph');
    });
    await check('unload removes the scoped control and style', async () => {
      const scene = createCase({ scope: 'main-root' }); await hover(scene); window.nativeInsertBlockPlugin.destroy();
      assert(!button() && !document.querySelector('#native-insert-block-styles'), 'Owned UI survived unload');
      scene.wrapper.classList.remove('rm-zoom-block-wrapper'); await frames(); assert(!button(), 'A late scope mutation revived the control');
    });
    const report = { mode, passed: results.every(r => r.ok), results, errors: [...errors] }; window.__nativeLayoutResult = report; return report;
  }

  const fixture = window.__nativeLayoutFixture = { ready: false, reset, createCase, hover, probe, run, calls, nativeToggles, errors };
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
