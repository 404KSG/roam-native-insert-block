const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime-harness');

const hiddenCaret = ['rm-caret', 'rm-caret-hidden'];
const showingCaret = ['rm-caret', 'rm-caret-open', 'rm-caret-showing'];
const inline = h => h.buttonClassContains('native-insert-block-no-children');
const settle = h => { h.triggerMutations(); h.flushAnimationFrames(); };
const childFor = h => h.createContainer({ inputId: 'block-input-main-child0001', blockUid: 'child0001' });

test('stationary pointer: first indent vacates the collapse slot and last outdent restores the leaf slot', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    assert.equal(inline(h), true);
    h.container.setNativeChildren([childFor(h)]);
    h.container.setNativeCaret(showingCaret);
    settle(h); // No pointermove, focus, keydown, or scroll after the initial hover.
    assert.equal(h.buttonExists(), true);
    assert.equal(inline(h), false, 'first child must move the plus away from the new native caret');
    h.container.setNativeChildren([]);
    h.container.setNativeCaret(hiddenCaret);
    settle(h);
    assert.equal(h.buttonExists(), true);
    assert.equal(inline(h), true, 'last child leaving must restore the leaf position');
    assert.equal(h.calls.create.length + h.calls.move.length + h.calls.update.length + h.calls.delete.length, 0);
  } finally { h.unload(); }
});

for (const scope of ['ordinary', 'sidebar-root', 'descendant', 'reference', 'embed', 'query', 'desk']) {
  test(`${scope}: child-list-only changes refresh without a caret class mutation`, () => {
    const h = createRuntime({ scope, ownCaretClass: hiddenCaret });
    try {
      h.renderForContainer();
      h.container.setNativeChildren([childFor(h)]);
      settle(h);
      assert.equal(inline(h), false);
      h.container.setNativeChildren([]);
      settle(h);
      assert.equal(inline(h), true);
    } finally { h.unload(); }
  });
}

test('stationary main root entering hidden-caret scope keeps its control and arms scope invalidation', () => {
  const h = createRuntime({ scope: 'main-root', ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    const originalButton = h.document.getElementById('native-insert-block-btn-container');
    assert.equal(h.activeObserverCount(), 1);
    h.container.setNativeChildren([childFor(h)]);
    settle(h);
    assert.equal(h.buttonExists(), true);
    assert.equal(h.document.getElementById('native-insert-block-btn-container'), originalButton, 'layout must not remount the action control');
    assert.equal(inline(h), true, 'main-root hidden-caret exception remains unchanged');
    assert.equal(h.activeObserverCount(), 2);
    h.container.setNativeCaret(showingCaret);
    settle(h);
    assert.equal(h.buttonExists(), false, 'newly armed exceptional scope must invalidate normally');
    assert.equal(h.activeObserverCount(), 0);
  } finally { h.unload(); }
});

test('newly exceptional root retains a valid action snapshot without remounting', async () => {
  const h = createRuntime({ scope: 'main-root', ownCaretClass: hiddenCaret });
  try {
    const control = h.renderForContainer();
    h.container.setNativeChildren([childFor(h)]);
    settle(h);
    await control.onClick(h.event());
    assert.equal(h.calls.create.length, 1);
    assert.equal(h.calls.create[0].location['parent-uid'], 'parent001');
  } finally { h.unload(); }
});

test('staggered caret and child rendering updates on the later child mutation', () => {
  const h = createRuntime({ ownCaretClass: null });
  try {
    h.renderForContainer();
    h.container.setNativeCaret(showingCaret, true);
    settle(h);
    h.container.setNativeChildren([childFor(h)]);
    settle(h);
    assert.equal(h.buttonExists(), true);
    assert.equal(inline(h), false);
  } finally { h.unload(); }
});

test('stationary main root with a showing caret follows the ordinary parent round trip', () => {
  const h = createRuntime({ scope: 'main-root', ownCaretClass: showingCaret });
  try {
    h.renderForContainer();
    h.container.setNativeChildren([childFor(h)]);
    settle(h);
    assert.equal(h.buttonExists(), true);
    assert.equal(inline(h), false);
    assert.equal(h.activeObserverCount(), 1);
    h.container.setNativeChildren([]);
    settle(h);
    assert.equal(inline(h), true);
  } finally { h.unload(); }
});

test('collapsed bullet state refreshes even when no child DOM is rendered', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    h.container.setCollapsed(true);
    settle(h);
    assert.equal(inline(h), false);
    h.container.setCollapsed(false);
    settle(h);
    assert.equal(inline(h), true);
  } finally { h.unload(); }
});

test('caret replacement and mutations on the replacement remain observable', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    h.container.setNativeChildren([childFor(h)]);
    h.container.setNativeCaret(showingCaret, true);
    settle(h);
    assert.equal(inline(h), false);
    assert.equal(h.pendingFrameCount(), 0);
    h.container.setNativeCaret(hiddenCaret);
    h.triggerMutations();
    assert.equal(h.pendingFrameCount(), 1, 'the observer must follow the replacement caret');
    h.flushAnimationFrames();
    assert.equal(inline(h), false, 'ordinary hidden-caret parent still reserves the caret slot');
  } finally { h.unload(); }
});

test('a mutation burst uses one frame and reads the final hierarchy', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    for (let i = 0; i < 40; i++) {
      h.container.setNativeChildren(i % 2 ? [] : [childFor(h)]);
      h.triggerMutations();
    }
    assert.equal(h.pendingFrameCount(), 1);
    h.container.setNativeChildren([childFor(h)]);
    h.triggerMutations();
    h.flushAnimationFrames();
    assert.equal(inline(h), false, 'queued work must not use the earlier leaf snapshot');
    assert.equal(h.pendingFrameCount(), 0, 'stable layout must not continuously schedule frames');
  } finally { h.unload(); }
});

test('plugin class/style mutations and nested-row state do not feed back into layout', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    const child = childFor(h);
    h.container.setNativeChildren([child]);
    settle(h);
    const button = h.document.getElementById('native-insert-block-btn-container');
    for (const attributeName of ['class', 'style']) {
      h.queueMutation({ type: 'attributes', target: button, attributeName });
    }
    child.setCollapsed(true);
    h.triggerMutations();
    assert.equal(h.pendingFrameCount(), 0);
    assert.equal(inline(h), false);
  } finally { h.unload(); }
});

test('same-UID pane switch cancels old frames and observes only the active container', () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    h.renderForContainer();
    h.container.setNativeChildren([childFor(h)]);
    h.triggerMutations();
    assert.equal(h.pendingFrameCount(), 1);
    const twin = h.createContainer({ inputId: 'block-input-sidebar-123456789', blockUid: '123456789', scope: 'sidebar-root' });
    h.pointerMove(twin);
    assert.equal(h.pendingFrameCount(), 0);
    h.container.setNativeChildren([]);
    h.triggerMutations();
    assert.equal(h.pendingFrameCount(), 0, 'old pane must no longer be watched');
    twin.setNativeChildren([childFor(h)]);
    settle(h);
    assert.equal(inline(h), false);
    assert.equal(h.document.getElementById('native-insert-block-btn-container').parentElement, twin);
  } finally { h.unload(); }
});

test('highlight and unload remove the button, disconnect observers, and cancel queued refreshes', () => {
  for (const cleanup of ['highlight', 'unload']) {
    const h = createRuntime({ ownCaretClass: hiddenCaret });
    h.renderForContainer();
    h.container.setNativeChildren([childFor(h)]);
    h.triggerMutations();
    assert.equal(h.pendingFrameCount(), 1);
    if (cleanup === 'unload') h.unload();
    else {
      h.container.classList.add('rm-block-highlight');
      h.queueMutation({ type: 'attributes', target: h.container, attributeName: 'class' });
      h.triggerMutations();
    }
    assert.equal(h.buttonExists(), false);
    assert.equal(h.activeObserverCount(), 0);
    assert.equal(h.pendingFrameCount(), 0);
    h.flushAnimationFrames();
    assert.equal(h.buttonExists(), false);
    h.unload();
  }
});

test('recycled block identity invalidates the visible control without graph actions', async () => {
  const h = createRuntime({ ownCaretClass: hiddenCaret });
  try {
    const control = h.renderForContainer();
    h.container.attributes['data-block-uid'] = 'other0001';
    h.queueMutation({ type: 'attributes', target: h.container, attributeName: 'data-block-uid' });
    settle(h);
    assert.equal(h.buttonExists(), false);
    await control.onClick(h.event({ shiftKey: true }));
    assert.equal(h.calls.delete.length, 0);
  } finally { h.unload(); }
});
