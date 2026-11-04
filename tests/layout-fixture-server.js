#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");

const bundle = fs.readFileSync("roamjs.js", "utf8");
const port = Number(process.env.PORT || 4173);

const html = `<!doctype html>
<meta charset="utf-8">
<title>Native Insert Block layout fixture</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; }
  .fixture { margin: 10px 0; min-height: 34px; }
  .roam-block-container { min-height: 30px; }
  .rm-bullet, .rm-block__controls { display: inline-block; width: 16px; }
  .rm-bullet__inner { display: inline-block; width: 12px; height: 12px; border: 1px solid #6b7280; border-radius: 50%; }
  .rm-caret { display: inline-block; width: 8px; height: 8px; border-left: 4px solid #6b7280; }
  #results { white-space: pre-wrap; padding: 12px; background: #f3f4f6; }
</style>
<div id="fixtures"></div><pre id="results">Running synthetic layout checks…</pre>
<script>
window.React = { createElement: (component, props) => ({ component, props }) };
window.Blueprint = { Core: { Icon: function Icon() {} } };
window.ReactDOM = {
  render: (component, target) => { target.textContent = "+"; target.__insertButton = component; },
  unmountComponentAtNode: (target) => { target.textContent = ""; }
};
window.roamAlphaAPI = {
  ui: { getFocusedBlock: () => null },
  util: { generateUID: () => "fixture01" },
  data: { pull: () => null }
};
const nativeRect = HTMLElement.prototype.getBoundingClientRect;
HTMLElement.prototype.getBoundingClientRect = function () {
  const container = this.matches?.(".roam-block-container")
    ? this
    : this.closest?.(".roam-block-container");
  const top = Number(container?.dataset.top || 0);
  if (this.matches?.(".roam-block-container")) return { top, height: 30, bottom: top + 30, left: 0, right: 300, width: 300 };
  if (this.matches?.(".rm-bullet__inner")) return { top: top + 20, height: 12, bottom: top + 32, left: 0, right: 12, width: 12 };
  if (this.matches?.(".rm-caret, .block-expand")) return { top: top + 8, height: 8, bottom: top + 16, left: 18, right: 26, width: 8 };
  if (this.id === "native-insert-block-btn-container") {
    const cssTop = Number.parseFloat(getComputedStyle(this).top || "0");
    return { top: top + cssTop, height: 24, bottom: top + cssTop + 24, left: 0, right: 24, width: 24 };
  }
  return nativeRect.call(this);
};
</script>
<script src="/roamjs.js"></script>
<script>
(() => {
  const fixtures = document.querySelector("#fixtures");
  const result = document.querySelector("#results");
  const rows = [];
  const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const block = ({ name, top, windowId = "main", caret = "visible", documentMode = false, nestedCaret = false, versionCollapsed = false, includeChildren = true }) => {
    const wrapper = document.createElement("div");
    wrapper.className = "fixture " + (documentMode ? "rm-block--document" : "");
    wrapper.dataset.name = name;
    const container = document.createElement("div");
    container.className = "roam-block-container " + (windowId === "sidebar" ? "sidebar-block" : "main-block");
    container.dataset.blockUid = "fixture-" + name;
    container.dataset.top = top;
    const input = document.createElement("textarea");
    input.id = "block-input-" + windowId + "-fixture-" + name;
    container.append(input);
    const bullet = document.createElement("span");
    bullet.className = "rm-bullet";
    bullet.append(Object.assign(document.createElement("span"), { className: "rm-bullet__inner" }));
    container.append(bullet);
    if (versionCollapsed) {
      container.append(Object.assign(document.createElement("span"), { className: "rm-version-choice-wrapper" }));
    }
    if (caret !== "absent") {
      const controls = document.createElement("span");
      controls.className = "rm-block__controls";
      const caretNode = document.createElement("span");
      caretNode.className = "rm-caret " + (caret === "class-hidden" ? "rm-caret-hidden" : "") + (versionCollapsed ? " rm-caret-closed" : "");
      if (caret === "hidden") caretNode.style.display = "none";
      if (caret === "transparent") caretNode.style.opacity = "0";
      controls.append(caretNode);
      container.append(controls);
      container.__caret = caretNode;
    }
    if (includeChildren) {
      const children = document.createElement("div");
      children.className = "rm-block-children";
      if (nestedCaret) {
        const child = document.createElement("div");
        child.className = "roam-block-container";
        child.dataset.top = top + 40;
        const childControls = document.createElement("span");
        childControls.className = "rm-block__controls";
        childControls.append(Object.assign(document.createElement("span"), { className: "rm-caret" }));
        child.append(childControls);
        children.append(child);
      } else {
        const child = document.createElement("div");
        child.className = "roam-block-container";
        child.dataset.top = top + 40;
        children.append(child);
      }
      container.append(children);
    }
    wrapper.append(container);
    fixtures.append(wrapper);
    return container;
  };
  const hover = (container) => container.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
  const currentButton = () => document.querySelector("#native-insert-block-btn-container");
  const expect = (condition, message) => { if (!condition) throw new Error(message); rows.push("PASS: " + message); };
  const run = async () => {
    const visibleMain = block({ name: "visible-main", top: 10 });
    hover(visibleMain);
    expect(!currentButton().classList.contains("native-insert-block-no-children"), "main visible caret keeps clearance");

    const hiddenSidebar = block({ name: "hidden-sidebar", top: 70, windowId: "sidebar", caret: "hidden" });
    hover(hiddenSidebar);
    expect(currentButton().classList.contains("native-insert-block-no-children"), "sidebar hidden caret uses own Bullet row");

    const absent = block({ name: "absent", top: 130, caret: "absent" });
    hover(absent);
    expect(currentButton().classList.contains("native-insert-block-no-children"), "absent caret uses own Bullet row");

    const hiddenNested = block({ name: "nested", top: 190, caret: "absent", nestedCaret: true });
    hover(hiddenNested);
    expect(currentButton().classList.contains("native-insert-block-no-children"), "descendant caret never anchors its parent");

    const documentMode = block({ name: "document", top: 250, documentMode: true });
    hover(documentMode);
    expect(currentButton().classList.contains("native-insert-block-document-mode"), "Document Mode stays inline");
    expect(currentButton().style.top === "", "Document Mode parent keeps CSS text-row positioning");

    const visibleVersion = block({ name: "visible-version", top: 290, versionCollapsed: true, includeChildren: false });
    hover(visibleVersion);
    expect(!currentButton().classList.contains("native-insert-block-no-children"), "visible collapsed Version Block keeps caret clearance");

    const hiddenVersion = block({ name: "hidden-version", top: 320, versionCollapsed: true, includeChildren: false, caret: "hidden" });
    hover(hiddenVersion);
    expect(currentButton().classList.contains("native-insert-block-no-children"), "hidden collapsed Version Block uses own Bullet row");

    const transition = block({ name: "transition", top: 350, caret: "hidden" });
    hover(transition);
    expect(currentButton().classList.contains("native-insert-block-no-children"), "transition starts inline while hidden");
    transition.__caret.style.display = "inline-block";
    await waitFrame();
    expect(!currentButton().classList.contains("native-insert-block-no-children"), "same-container reveal restores clearance");
    transition.__caret.style.display = "none";
    await waitFrame();
    expect(currentButton().classList.contains("native-insert-block-no-children"), "same-container hide clears stale placement");

    window.nativeInsertBlockPlugin.destroy();
    expect(!currentButton() && !document.querySelector("#native-insert-block-styles"), "unload removes plugin DOM and styles");
    result.textContent = rows.join("\\n");
    window.__nativeInsertFixture = { passed: true, rows };
  };
  run().catch((error) => {
    result.textContent = "FAIL: " + error.message;
    window.__nativeInsertFixture = { passed: false, error: error.message };
    throw error;
  });
})();
</script>`;

http
  .createServer((request, response) => {
    if (request.url === "/roamjs.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Native Insert Block layout fixture: http://127.0.0.1:${port}`);
  });
