# Native Insert Block

Add, nest, wrap, or remove Roam blocks from one small control beside the active block. It stays aligned with the current text row, including in Document Mode, and reveals every action on right-click.

![Native Insert Block in Roam Research](https://github.com/user-attachments/assets/3e0c261b-1383-439b-9f41-f5d69b38be8d)

## Controls

- **Click** — insert a sibling block below.
- **Right-click** — open the complete block action menu.
- **Command + Click** — insert a child block.
- **Option + Click** — insert a sibling block above.
- **Control + Click** — wrap the current block in a new parent.
- **Shift + Click** — delete the current block.

On Windows and Linux, use **Ctrl** for a child and **Ctrl + Alt** for a parent. Hold any modifier to preview its action on the button.

## Install

Open **Roam Settings → Extensions**, search for **Native Insert Block**, and select **Install**.

For manual use, paste `src/index.js` into a `{{[[roam/js]]}}` code block and refresh Roam.

## Privacy

Native Insert Block runs through Roam's local API. It has no analytics, external service, or runtime dependency, and it does not send graph data anywhere.

## Development

```bash
npm test
npm run build
```

Edit `src/index.js`; the build generates the Roam Depot-compatible `extension.js`.

## Credits

Inspired by [roam-quick-insert-block](https://github.com/dive2Pro/roam-quick-insert-block) by dive2Pro (hyc).
