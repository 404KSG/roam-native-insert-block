/* Owned fixture only. Do not inject into a user graph. */
(async () => {
  const mode = new URLSearchParams(location.search).get("mode") || "depot";
  const errors = [], calls = [], records = new Map(); let nextUid = 0;
  window.addEventListener("error", event => errors.push(event.error?.message || event.message));
  window.addEventListener("unhandledrejection", event => errors.push(String(event.reason?.message || event.reason)));
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  window.React = { createElement: (component, props) => ({ component, props }) };
  window.Blueprint = { Core: { Icon() {} } };
  window.ReactDOM = {
    render({ props }, target) {
      const icon = document.createElement("span"); icon.className = "bp3-icon bp3-icon-plus";
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5"/></svg>';
      for (const [type, callback] of [["click", props.onClick], ["mousedown", props.onMouseDown], ["contextmenu", props.onContextMenu]]) if (callback) icon.addEventListener(type, callback);
      target.replaceChildren(icon);
    },
    unmountComponentAtNode(target) { target.replaceChildren(); }
  };
  window.roamAlphaAPI = {
    data: { pull: (_query, lookup) => copy(records.get(lookup[1])) || null },
    util: { generateUID: () => `fixture-created-${++nextUid}` },
    ui: {
      getFocusedBlock: () => document.activeElement?.dataset?.blockUid ? { "block-uid": document.activeElement.dataset.blockUid, "window-id": document.activeElement.dataset.windowId } : null,
      setBlockFocusAndSelection: async value => { calls.push({ type: "focus", value: copy(value) }); }
    },
    createBlock: async value => { calls.push({ type: "create", value: copy(value) }); records.set(value.block.uid, { ":block/uid": value.block.uid, ":block/string": value.block.string, ":block/order": value.location.order, ":block/children": [], ":block/_children": [{ ":block/uid": value.location["parent-uid"] }] }); },
    deleteBlock: async value => { calls.push({ type: "delete", value: copy(value) }); records.delete(value.block.uid); },
    moveBlock: async value => { calls.push({ type: "move", value: copy(value) }); },
    updateBlock: async value => { calls.push({ type: "update", value: copy(value) }); }
  };
  const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const sameRect = (a, b) => Object.keys(a).every(key => Math.abs(a[key] - b[key]) < .1);
  const centerY = element => { const r = element.getBoundingClientRect(); return r.top + r.height / 2; };
  const button = () => document.querySelector("#native-insert-block-btn-container");
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = async predicate => { const deadline = performance.now() + 1800; while (!predicate()) { if (performance.now() > deadline) throw new Error("Fixture condition timed out"); await frames(); } };
  function reset() {
    window.nativeInsertBlockPlugin?.destroy();
    document.querySelector("#main-fixtures").replaceChildren(); document.querySelector("#sidebar-fixtures").replaceChildren();
    calls.length = 0; records.clear(); records.set("fixture-page", { ":block/uid": "fixture-page", ":node/title": "Fixture page" });
    window.nativeInsertBlockPlugin?.init();
  }
  function createCase({ name = "parent", caret = "hidden", sidebar = false, depth = 0, children = true, nestedFirst = false, documentMode = false, version = false, ariaHidden = false } = {}) {
    const mount = document.querySelector(sidebar ? "#sidebar-fixtures" : "#main-fixtures");
    const shell = document.createElement("div"); if (documentMode) shell.className = "rm-block--document";
    const container = document.createElement("div"); container.className = "roam-block-container"; container.dataset.blockUid = `fixture-${name}`; container.style.marginLeft = `${depth * 28}px`;
    const row = document.createElement("div"); row.className = "rm-block-main";
    const controls = document.createElement("span"); controls.className = "rm-block__controls";
    let arrow = null, expander = null;
    if (caret !== "absent") {
      expander = document.createElement("span"); expander.className = "block-expand";
      arrow = document.createElement("span"); arrow.className = "rm-caret" + (version ? " rm-caret-closed" : "");
      if (caret === "hidden") arrow.style.display = "none";
      if (caret === "transparent") arrow.style.opacity = "0";
      if (caret === "class-hidden") arrow.classList.add("rm-caret-hidden");
      if (caret === "ancestor-hidden") expander.style.display = "none";
      if (caret === "visible-override") { expander.style.visibility = "hidden"; arrow.style.visibility = "visible"; }
      if (ariaHidden) arrow.setAttribute("aria-hidden", "true");
      expander.append(arrow); controls.append(expander);
    }
    const bullet = document.createElement("span"); bullet.className = "rm-bullet";
    const dot = document.createElement("span"); dot.className = "rm-bullet__inner"; bullet.append(dot); controls.append(bullet);
    const input = document.createElement("textarea"); input.className = "rm-block-input"; input.rows = 1; input.value = "Focused parent block";
    input.id = `block-input-${sidebar ? "right-sidebar-1" : "main"}-${container.dataset.blockUid}`; input.dataset.blockUid = container.dataset.blockUid; input.dataset.windowId = sidebar ? "right-sidebar-1" : "main";
    row.append(controls, input);
    if (version) row.append(Object.assign(document.createElement("span"), { className: "rm-version-choice-wrapper" }));
    let child = null;
    if (children) {
      child = document.createElement("div"); child.className = "rm-block-children";
      const nested = document.createElement("div"); nested.className = "roam-block-container"; nested.dataset.blockUid = `fixture-${name}-child`;
      nested.innerHTML = '<div class="rm-block-main"><span class="rm-block__controls"><span class="block-expand"><span class="rm-caret"></span></span><span class="rm-bullet"><span class="rm-bullet__inner"></span></span></span><span class="child-note">Nested child with its own caret</span></div>';
      child.append(nested);
      if (nestedFirst) container.append(child, row); else container.append(row, child);
    } else container.append(row);
    const following = document.createElement("div"); following.className = "after-row"; following.textContent = "Following sibling keeps its position";
    shell.append(container, following); mount.append(shell);
    records.set(container.dataset.blockUid, { ":block/uid": container.dataset.blockUid, ":block/string": input.value, ":block/order": 0, ":block/children": child ? [{ ":block/uid": `fixture-${name}-child` }] : [], ":block/_children": [{ ":block/uid": "fixture-page" }] });
    return { shell, container, row, controls, arrow, expander, bullet, dot, input, child, following };
  }
  function layoutSnapshot(c) { return { container: rect(c.container), input: rect(c.input), bullet: rect(c.dot), sibling: rect(c.following), child: c.child ? rect(c.child) : null, margin: getComputedStyle(c.container).marginLeft }; }
  function unchanged(c, before) { const after = layoutSnapshot(c); return ["container", "input", "bullet", "sibling"].every(key => sameRect(before[key], after[key])) && before.margin === after.margin && (!before.child || sameRect(before.child, after.child)); }
  async function hover(c) { c.container.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })); await frames(); }
  function probe(c) {
    const b = button(), br = b?.getBoundingClientRect(), dot = c.dot.getBoundingClientRect();
    return { button: b ? rect(b) : null, bullet: rect(c.dot), centerDelta: b ? centerY(b) - centerY(c.dot) : null, leftGap: br ? dot.left - br.right : null, inline: b?.classList.contains("native-insert-block-no-children"), cssTop: b ? getComputedStyle(b).top : null, childIndent: c.child ? c.child.getBoundingClientRect().left - c.container.getBoundingClientRect().left : null };
  }
  async function run() {
    const checks = [];
    async function check(name, body) { const errorOffset = errors.length; reset(); try { await body(); if (errors.length !== errorOffset) throw new Error(errors.slice(errorOffset).join("; ")); checks.push({ name, ok: true }); } catch (error) { checks.push({ name, ok: false, error: error.message }); } }
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const options of [
      { name: "hidden", caret: "hidden" }, { name: "absent", caret: "absent" },
      { name: "transparent", caret: "transparent" }, { name: "hidden-class", caret: "class-hidden" },
      { name: "hidden-ancestor", caret: "ancestor-hidden" },
      { name: "nested-first", caret: "absent", nestedFirst: true, depth: 2 },
      { name: "sidebar", caret: "hidden", sidebar: true, depth: 1 },
      { name: "hidden-version", caret: "hidden", version: true, children: false }
    ]) await check(`${options.name}: plus is before the own Bullet without changing layout`, async () => {
      const c = createCase(options), before = layoutSnapshot(c); await hover(c); const b = button(), p = probe(c);
      assert(p.inline, "Hidden/absent own caret kept parent clearance");
      assert(Math.abs(p.centerDelta) < .5, `Vertical center mismatch: ${p.centerDelta}`);
      assert(p.leftGap >= 0, `Control overlaps Bullet horizontally: ${p.leftGap}`);
      assert(p.button.width === 24 && p.button.height === 24, "Hitbox is not 24 by 24 CSS pixels");
      assert(getComputedStyle(b).position === "absolute" && getComputedStyle(b).left === "0px", "Control changed native layout flow");
      assert(unchanged(c, before), "Text, child indentation, native Bullet or sibling layout changed");
      const r = b.getBoundingClientRect(), d = c.dot.getBoundingClientRect();
      assert(b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), "Plus center is not clickable");
      assert(!b.contains(document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2)), "Plus intercepts the native Bullet");
      assert(calls.length === 0, "Positioning wrote to the graph");
    });
    for (const options of [{ name: "visible", caret: "visible" }, { name: "visible-aria", caret: "visible", ariaHidden: true }, { name: "visible-version", caret: "visible", children: false, version: true }, { name: "visible-override", caret: "visible-override" }]) await check(`${options.name}: visible own caret keeps clearance`, async () => {
      const c = createCase(options), before = layoutSnapshot(c); await hover(c);
      assert(!probe(c).inline, "A visually rendered caret was treated as hidden");
      assert(centerY(button()) >= c.arrow.getBoundingClientRect().bottom + 4 - .1, "Plus lost caret clearance");
      assert(unchanged(c, before), "Caret placement moved the native outline");
    });
    await check("Document Mode parent retains its CSS text-row placement", async () => {
      const c = createCase({ name: "document", documentMode: true, caret: "visible" }); await hover(c);
      assert(button().classList.contains("native-insert-block-document-mode"), "Document Mode class missing");
      assert(button().style.top === "" && probe(c).cssTop === "1px", "Document Mode parent used outline Bullet geometry");
    });
    await check("same-container hide/reveal updates position without moving the pointer", async () => {
      const c = createCase({ name: "transition", caret: "hidden" }); await hover(c);
      assert(probe(c).inline, "Initial hidden caret did not align inline");
      c.arrow.style.display = "block"; await wait(() => button() && !probe(c).inline);
      c.arrow.style.display = "none"; await wait(() => button() && probe(c).inline && Math.abs(probe(c).centerDelta) < .5);
    });
    await check("idle placement produces no self-induced style loop", async () => {
      const c = createCase({ name: "idle" }); await hover(c); let mutations = 0;
      const observer = new MutationObserver(records => { mutations += records.length; }); observer.observe(button(), { attributes: true, subtree: true });
      try { for (let i = 0; i < 6; i++) await frames(); } finally { observer.disconnect(); }
      assert(mutations === 0, `Unexpected idle style mutations: ${mutations}`);
    });
    await check("detached active container loses its owned control before reinsertion", async () => {
      const c = createCase({ name: "detached" }); await hover(c); c.container.remove(); await frames();
      assert(!c.container.querySelector("#native-insert-block-btn-container"), "Detached container retained an orphan control");
      c.shell.prepend(c.container); await hover(c);
      assert(document.querySelectorAll("#native-insert-block-btn-container").length === 1, "Reinsertion duplicated controls");
    });
    await check("unload removes control and styles without altering the outline", async () => {
      const c = createCase({ name: "unload" }), before = layoutSnapshot(c); await hover(c); window.nativeInsertBlockPlugin.destroy();
      assert(!button() && !document.querySelector("#native-insert-block-styles"), "Owned UI survived unload");
      assert(unchanged(c, before), "Unload changed native outline geometry");
    });
    const report = { mode, passed: checks.every(c => c.ok), checks, errors: [...errors] };
    document.querySelector("#results").textContent = JSON.stringify(report, null, 2); window.__nativeLayoutResult = report; return report;
  }
  const fixture = window.__nativeLayoutFixture = { ready: false, reset, createCase, hover, probe, run, calls, errors };
  if (mode === "roamjs") await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "/roamjs.js"; script.onload = resolve; script.onerror = reject; document.body.append(script); });
  else { const module = await import("/extension.js"); module.default.onload(); }
  fixture.ready = true;
  const show = async caret => { reset(); fixture.current = createCase({ name: "preview", caret }); fixture.current.input.focus(); await hover(fixture.current); document.querySelector("#results").textContent = JSON.stringify(probe(fixture.current), null, 2); };
  document.querySelector("#run-layout").addEventListener("click", () => run().catch(error => { document.querySelector("#results").textContent = error.stack; }));
  document.querySelector("#show-hidden").addEventListener("click", () => show("hidden"));
  document.querySelector("#show-visible").addEventListener("click", () => show("visible"));
  await show("hidden");
})().catch(error => { document.querySelector("#results").textContent = error.stack; window.__nativeLayoutLoadError = error.message; });
