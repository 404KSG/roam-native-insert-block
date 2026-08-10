# Native Insert Block

Add, nest, wrap, or remove Roam blocks from one small control beside the active block. The button follows Roam's own bullet and caret geometry, including in Document Mode and nested outlines.

![Native Insert Block in Roam Research](https://github.com/user-attachments/assets/3e0c261b-1383-439b-9f41-f5d69b38be8d)

## Controls

- **Click** — insert a sibling block below.
- **Command + Click** — insert a child block.
- **Option + Click** — insert a sibling block above.
- **Control + Click** — wrap the current block in a new parent.
- **Shift + Click** — delete the current block.

Use one modifier at a time. Combined modifiers are ignored to prevent accidental actions.

## Install

While the extension is awaiting Depot review, install the PR preview with this shorthand:

```text
404KSG+roam-native-insert-block+1406
```

After [Depot PR #1406](https://github.com/Roam-Research/roam-depot/pull/1406) is merged, open **Roam Settings → Extensions**, search for **Native Insert Block**, and select **Install**.

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
