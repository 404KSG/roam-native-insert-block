# 使用指南

## 工作流程（已调整为你的需求）

### 1. 日常开发和修改
**只需要编辑 `src/index.js` 文件**，这是 IIFE 格式，可以直接在 Roam 的 `{{[[roam/js]]}}` 中使用。

### 2. 在 Roam 中测试

#### 直接使用源文件
1. 复制 `src/index.js` 的全部内容
2. 在 Roam 中创建一个 `{{[[roam/js]]}}` 块
3. 粘贴代码
4. 刷新页面即可使用

### 3. 发布到官方插件市场

当你准备发布到 Roam Plugin Depot 时：

```bash
npm run build
```

这会自动生成 `extension.js`（ES6 模块格式），然后：
1. 提交 `src/index.js` 和 `extension.js` 到 GitHub
2. 在 Roam 插件市场提交你的插件

## 自动监听模式

如果你希望每次修改 `src/index.js` 后自动生成 `extension.js`：

```bash
npm run build:watch
```

这样每次保存 `src/index.js` 时，都会自动重新生成 `extension.js`。

## 文件说明

| 文件 | 用途 | 格式 | 是否手动编辑 | 提交到 Git |
|------|------|------|--------------|------------|
| `src/index.js` | 源代码 | IIFE | ✅ 是（主要编辑） | ✅ 是 |
| `extension.js` | 插件市场版本 | ES6 模块 | ❌ 否（自动生成） | ✅ 是 |
| `build.js` | 构建脚本 | - | ✅ 是 | ✅ 是 |
| `package.json` | 项目配置 | - | ✅ 是 | ✅ 是 |

## 项目结构

```
native-insert-block/
│
├── 📝 src/index.js              # 源代码（IIFE 格式）
│                                 # ✅ 用于 Roam {{[[roam/js]]}}
│                                 # ✅ 你主要编辑这个文件
│
├── 🔧 build.js                  # 构建脚本
│                                 # 自动将 IIFE 转换为 ES6 模块
│
├── 📦 package.json              # 项目配置
│
├── 📖 README.md                 # 项目说明
│
└── 📄 extension.js              # 自动生成（ES6 模块格式）
                                  # ✅ 用于 Roam Plugin Depot
                                  # ⚠️ 自动生成，不要手动编辑
```

## 工作流程图

```
┌─────────────────┐
│  src/index.js   │  ← 你只需要编辑这个文件（IIFE 格式）
│  (源代码)       │     可以直接在 Roam 中使用
└────────┬────────┘
         │
         │ npm run build
         ↓
┌─────────────────┐
│    build.js     │  ← 自动转换格式
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  extension.js                       │
│  (ES6 模块格式，用于插件市场)       │
└─────────────────────────────────────┘
```

## 两种使用方式

### 方式 1: 本地使用（开发/测试）
```
src/index.js
    ↓ 复制粘贴
Roam {{[[roam/js]]}} 块
    ↓ 刷新页面
✅ 插件运行
```

### 方式 2: 官方插件市场
```
src/index.js
    ↓ npm run build
extension.js
    ↓ 提交到 GitHub
Roam Plugin Depot
    ↓ 用户安装
✅ 插件运行
```

## 关键优势

✅ **主要编辑 IIFE 格式**：符合你的工作习惯
✅ **自动转换**：构建脚本处理格式转换
✅ **避免冲突**：不会出现两个文件不同步的问题
✅ **开发友好**：支持 `--watch` 模式实时生成
✅ **直接可用**：`src/index.js` 可以直接在 Roam 中使用

## 注意事项

- 永远不要手动编辑 `extension.js`，它会被覆盖
- 所有修改都在 `src/index.js` 中进行
- 提交代码前记得运行 `npm run build` 确保生成最新的 `extension.js`
- `src/index.js` 是 IIFE 格式，可以直接复制到 Roam 使用
