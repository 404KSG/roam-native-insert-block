# Native Insert Block

![CleanShot 2025-12-02 at 10 27 40](https://github.com/user-attachments/assets/3e0c261b-1383-439b-9f41-f5d69b38be8d)

Click the button to:

* **Click** – insert a new sibling block *below*
* **Cmd + Click** – insert a new *child* block
* **Option + Click** – insert a new block *above*
* **Ctrl + Click** – insert a new *parent* block above
* **Shift + Click** – delete the current block

## Installation

### Option 1: Use in Roam directly ({{[[roam/js]]}})

1. Copy the content from `src/index.js`
2. In Roam, create a `{{[[roam/js]]}}` block
3. Paste the code into the code block
4. Refresh the page

### Option 2: Install from Roam Plugin Marketplace

1. Go to Roam Settings → Extensions
2. Search for "Native Insert Block"
3. Click Install

## Development

### Project Structure

```
native-insert-block/
├── src/
│   └── index.js          # 源代码 (IIFE 格式) - 你主要编辑这个文件
├── extension.js          # 自动生成 (ES6 模块格式，用于插件市场)
├── build.js              # 构建脚本
└── package.json
```

### Workflow

**你只需要编辑 `src/index.js`**，这是 IIFE 格式，可以直接在 Roam 的 `{{[[roam/js]]}}` 中使用。

当你准备发布到官方插件市场时，运行：

```bash
npm run build
```

这会自动生成 `extension.js`（ES6 模块格式），用于提交到 Roam Plugin Depot。

### Build Commands

```bash
# 生成插件市场版本
npm run build

# 监听模式（自动重新生成）
npm run build:watch
```

### How It Works

- **源文件**: `src/index.js` 使用 IIFE 格式 `(() => { ... })()`
- **构建**: `build.js` 自动转换为 ES6 模块格式，添加 `export default { onload, onunload }`
- **输出**: `extension.js` 用于提交到 Roam Plugin Depot

这样，你只需维护一个源文件（`src/index.js`），构建脚本会自动生成插件市场需要的版本。

## Acknowledgements

This plugin was inspired by and adapted from the [roam-quick-insert-block](https://github.com/dive2Pro/roam-quick-insert-block) repository by dive2Pro (hyc).
