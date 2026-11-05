# 鼠标静止时层级变化：修复与验证

- 日期：2026-11-05
- 基线：`6d07f5e`，v0.9.6 / `fix/main-focused-root-only`
- 修复分支：`fix/stationary-hierarchy-refresh`
- 版本：v0.9.7 更新候选。测试已完成；正式分发以 Depot PR 合并为准，未替换用户 Roam 已安装版本。

## 根因与修复边界

无子级 block 被 hover 时，加号使用 bullet 同行位置。原来的普通 block observer 只看容器自身的高亮 class，不看子级、bullet、caret 变化；同一 block 的 pointermove 也只比较身份快照。因此用 Tab 移入第一个子块后，加号保留旧的无子级位置和 inline top，与新出现的折叠按钮重叠。

修复只扩展当前活动容器的 observer：监听原生行的结构和相关属性变化，在一帧内合并更新并读取最新层级；不监听全局页面、不轮询、不修改图谱。忽略插件自身 class/style 更新及其他子行的变化，防止反馈循环。原生 caret/controls 替换后仍由容器级观察覆盖。主窗口聚焦根块从 leaf 进入隐藏 caret 例外时保留同一个按钮，并启用原有 scope 失效保护；身份改变时移除旧按钮。

原有 CSS、子级判定、bullet/caret 位置计算、主窗口例外判定、按键修饰操作保持不变。Grok 4.7 独立只读排查确认了根因，并提出 scope 进入和控件替换的回归要求；测试和实现由主会话执行。

## 验证证据

1. 修复前先运行精确回归，断言 `first child must move the plus away from the new native caret` 失败；真实浏览器也测得移入子块后仍 `inline: true`、`nativeCaretHit: false`。见 [修复前截图](before.png)。
2. `npm test`：原有 smoke、语法检查、**97 项 Node 测试**全部通过；其中新增 19 项静止指针/层级回归。生成包运行时代码行覆盖率 87.59%。见 [完整输出](node-tests.txt)。
3. 真实 Chromium DOM / MutationObserver / hit-test：Depot、手动脚本、减少动画配置各 **44 项通过**，没有浏览器错误。见 [Depot](depot.json)、[手动脚本](roamjs.json)、[减少动画](reduced-motion.json)。
4. 真实鼠标 hover 后，通过浏览器可信键盘输入连续执行 **5 轮 Tab / Shift+Tab**；期间 pointermove 增量为 **0**。移入子块后加号使用父级留白位置，最后一个子块移出后回到 bullet 同行。随后真实点击折叠按钮触发一次 native toggle，插件图谱写入为 0。见 [按键结果](trusted-input.json)、[修复后截图](after.png)。
5. scope 失效、同 UID 跨面板、原生控件替换、分批渲染、连续变化合并、卸载和高亮清理均有回归覆盖。

**验证边界：以上浏览器结果来自隔离的 Roam DOM 测试页，不是已安装插件在用户真实图谱中的验收。没有读取或修改用户图谱。**

## 复跑

```bash
cd roam-native-insert-block
npm test
node tests/layout-fixture-server.js
```

打开输出的本地地址，点击运行测试；`?mode=roamjs` 测试手动脚本。浏览器中的 `window.__nativeLayoutFixture.createKeyboardCase()` 提供 Tab / Shift+Tab 重现环境。

## 已验证生成物 SHA-256

- `src/index.js`: `0b3e1697ae7bfe4335cdcff4bc42627d694e0c6d31d15f2f0280ecf6da033d82`
- `extension.js`: `86acfb3eef4eb4dfdde4e13949440c33cf254b758c575640a40c605a13ea8380`
- `roamjs.js`: `93b5edb3b660d3f546d939f6a978a3b92d94d122248b78e58bc5978e847f3cca`
