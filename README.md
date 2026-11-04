# Native Insert Block

Add, nest, wrap, or remove Roam blocks from one small control beside the active block. The button stays aligned with your current text row, including in Document Mode.

## v0.9.5

When Roam hides or omits a parent’s collapse control, the plus aligns with that block’s own Bullet. A caret starting a hover fade-in now reserves its space before its first visible frame, and CSS motion events refresh placement without requiring another pointer move or keypress. Truly hidden controls still use the inline Bullet row.

Caret clearance uses the visible plus glyph's edge rather than only its center, preserving the normal baseline while preventing edge overlap with unusually low carets. Document Mode, collapsed Version Blocks, the 24px hitbox, and the existing actions remain unchanged.

![Native Insert Block in Roam Research](https://github.com/user-attachments/assets/3e0c261b-1383-439b-9f41-f5d69b38be8d)

## Controls

- **Click** — insert a sibling block below.
- **Command + Click** — insert a child block.
- **Option + Click** — insert a sibling block above.
- **Control + Click** — wrap the current block in a new parent.
- **Shift + Click** — delete the current block.

Use one modifier at a time. Combined modifiers are ignored to prevent accidental actions.

The control identifies a block from the owning container's native `data-block-uid`, then checks that the input id is `block-input-{windowId}-{that uid}`. If that attribute is missing or contradicts the input id, the action is refused. Failed or uncertain actions show a brief nonblocking status message that does not include graph content. Automated tests use mocked Roam APIs. Live installation results are reported in the update PR.

## Install

Open **Roam Settings → Extensions**, search for **Native Insert Block**, and select **Install**.

To try a preview of the version in the active update PR, use the shorthand shown in that PR.

For manual use, run `npm run build`, paste the generated `roamjs.js` into a `{{[[roam/js]]}}` code block, and refresh Roam. Use only one installation method at a time.

## Privacy

Native Insert Block runs through Roam's local API. It has no analytics, external service, or runtime dependency, and it does not send graph data anywhere.

## Development

```bash
npm test
npm run build
```

Edit `src/action-mode.js` for modifier behavior and `src/index.js` for the Roam runtime. The build generates `extension.js` for the Depot and `roamjs.js` for manual use.

For the dependency-free browser fixture, run `node tests/layout-fixture-server.js`, open `http://127.0.0.1:4173`, and click **Run layout checks**. **Trace hover fade** lets you move the pointer onto the sample block and inspect CSS animation samples for glyph overlap and caret hit interception. The default uses the Depot bundle; `?mode=roamjs` uses the manual bundle. It uses an in-memory API and real browser layout rather than patched rectangle measurements.

### Verification boundary

The automated smoke suite, 65 Node tests, syntax checks, and coverage attribution pass. Coverage includes hidden/absent carets, CSS motion, nested ownership, Document Mode, Version Blocks, visibility changes, listener cleanup, and validated graph actions.

For v0.9.5, all **18 real-layout browser checks** passed for the Depot bundle, manual bundle, and reduced-motion mode. **15 trusted-pointer motion scenarios** passed across fades, delayed/ancestor fades, CSS animation, fade-out recovery, permanently transparent controls, and reduced motion, with no sampled glyph overlap or caret hit interception. A trusted caret click caused no plugin write; a trusted plus click created exactly one mock block.

Replaying v0.9.4 reproduced overlap with the caret fully visible and no caret DOM mutation; an unrelated later UI mutation corrected it. [Before](assets/hover-overlap-before.png) / [after](assets/hover-overlap-after.png) are screenshots of this synthetic fixture, not the user's graph.

These browser results close the isolated geometry/hit-testing gap recorded for v0.9.4. Live Roam installation, production graph behavior, and broader theme/extension compatibility remain separate acceptance work; no production graph or installed extension was changed.

## Credits

Inspired by [roam-quick-insert-block](https://github.com/dive2Pro/roam-quick-insert-block) by dive2Pro (hyc).
