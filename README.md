# Native Insert Block

Add, nest, wrap, or remove Roam blocks from one small control beside the active block. The button stays aligned with your current text row, including in Document Mode.

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

## Credits

Inspired by [roam-quick-insert-block](https://github.com/dive2Pro/roam-quick-insert-block) by dive2Pro (hyc).
