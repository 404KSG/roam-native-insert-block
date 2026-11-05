# Native Insert Block

Add, nest, wrap, or remove Roam blocks from one small control beside the active block. The button stays aligned with your current text row, including in Document Mode.

## v0.9.7

The plus now refreshes when the hovered block gains or loses children while the pointer stays still. Indenting the first child with Tab clears the native collapse control; outdenting the last child restores the leaf position. Observation follows replacement native controls, coalesces changes into one animation frame, and ignores the plugin's own layout writes. The v0.9.6 placement rules and click actions are unchanged.

Verification: **97 Node tests**, **44 browser-fixture checks in each of three configurations**, and **five trusted Tab/Shift+Tab cycles with zero pointer moves**, followed by a successful native collapse click. See the [regression report and before/after evidence](artifacts/stationary-hierarchy/README.md). These are isolated-fixture results, not live user-graph acceptance.

## v0.9.6

This version withdraws the global visibility/animation placement changes from 0.9.4–0.9.5. Ordinary geometry and caret spacing are restored to the published 0.9.3 baseline.

Only the main-pane zoomed block root can place the plus before its own Bullet when its own native caret is absent or marked hidden. The block must be a direct `.rm-zoom-block-wrapper` child in `.roam-body-main`; sidebar copies (even the same UID), focused-view descendants, ordinary parents, references/embeds/queries, Desk, leaves, Document Mode, and Version Blocks stay on the baseline path. Opacity, animations, editor focus, and a literal window ID are not used to infer this scope.

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

For the owned browser-layout fixture, run `node tests/layout-fixture-server.js` and open the local URL it prints. It uses an in-memory API, real DOM ancestry and MutationObservers, and main-root/sidebar/descendant cases with native row-local caret hover. Start from the parent body outside its row, then move to the caret to check that ordinary native controls remain reachable. `?mode=roamjs` exercises the manual bundle.

### v0.9.6 verification boundary

The 0.9.3 styles, ordinary geometry helpers, modifier/action implementation, and original smoke suite are retained unchanged. The automated build, smoke suite, **78 Node tests**, syntax checks, and coverage pass. New scope tests model actual observer registrations and matching mutation delivery rather than invoking every observer manually.

Read-only inspection of Roam's public documentation graph confirmed the main-root, same-UID sidebar, descendant, and ordinary-page DOM/hover distinctions used by the predicate. The owned Chromium fixture passed **33 checks in each of three configurations** (Depot, manual bundle, and reduced-motion preference). Trusted pointer comparisons reproduced the 0.9.5 caret-interception bug and confirmed that ordinary parents, sidebar copies, and focused descendants now match 0.9.3 geometry and preserve native collapse clicks. Same-UID pane switching and actual observer invalidation also passed.

See the [acceptance report, screenshots, and raw results](artifacts/main-root-acceptance/README.md). These are real-browser fixture results, not live-extension acceptance: no user graph or installed extension was changed.

## Credits

Inspired by [roam-quick-insert-block](https://github.com/dive2Pro/roam-quick-insert-block) by dive2Pro (hyc).
