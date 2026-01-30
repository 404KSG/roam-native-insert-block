# 快速参考

## 📝 日常工作

### 编辑代码
```bash
# 只需要编辑这个文件
src/index.js
```

这是 IIFE 格式，可以直接复制到 Roam 的 `{{[[roam/js]]}}` 块中使用。

### 测试插件
1. 复制 `src/index.js` 的内容
2. 粘贴到 Roam 的 `{{[[roam/js]]}}` 块
3. 刷新页面

### 发布到插件市场
```bash
npm run build
```

这会自动生成 `extension.js`，然后提交到 GitHub。

## 📂 文件说明

| 文件 | 说明 | 是否编辑 |
|------|------|----------|
| `src/index.js` | 源代码（IIFE 格式） | ✅ 主要编辑 |
| `extension.js` | 插件市场版本（自动生成） | ❌ 不要编辑 |
| `build.js` | 构建脚本 | 偶尔修改 |
| `package.json` | 项目配置 | 偶尔修改 |

## 🔄 工作流程

```
编辑 src/index.js
    ↓
复制到 Roam 测试
    ↓
满意后运行 npm run build
    ↓
提交到 GitHub
    ↓
发布到插件市场
```

## ⚠️ 重要提示

- **永远不要手动编辑 `extension.js`**，它会被构建脚本覆盖
- **所有修改都在 `src/index.js` 中进行**
- **提交前记得运行 `npm run build`**

## 🎯 核心优势

✅ 主要编辑 IIFE 格式（符合你的习惯）
✅ 可以直接在 Roam 中使用
✅ 自动生成插件市场版本
✅ 避免两个文件不同步
