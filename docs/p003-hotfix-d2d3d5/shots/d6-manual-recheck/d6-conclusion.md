# D6 定向人工复测记录（T10.8）

> 依据：manual-steps.md 附 D6 观察项（PM 裁定 0.2.6-2 并入）；spec 8.2 D6 定向回归。
> 执行时刻：2026-10-21 11:1x（D3 六场景 + V3 复测后，同一编辑会话内执行）。

## 目标

WPS 工具栏保存按钮一次点击行为定性（V1-V7 期间 D6 疑似坐标问题）。

## 执行步骤与证据

### 1. 编辑增量文本

在 smb_cache/test-render.docx 编辑会话中输入 "D6" 增量文本（经 ESC 触发保存确认对话框，点击"保存"落盘：
stat mtime=1792552439，size 9155→9164）。

### 2. uiautomator dump 工具栏（禁止视觉估算）

WPS 编辑页顶部工具栏全部可点击元素（d6-toolbar-dump.xml）：

| resource-id | bounds | 说明 |
|---|---|---|
| writer_maintoolbar_slidemenu_show | [18,56][95,133] | 侧滑菜单 |
| writer_maintoolbar_indicator | [102,56][179,133] | 文件菜单入口 |
| writer_maintoolbar_undo | [270,56][347,133] | 撤销 |
| writer_maintoolbar_redo | [354,56][431,133] | 重做 |
| writer_maintoolbar_split | [769,56][846,133] | 分屏 |
| writer_ink_function | [937,56][1014,133] | 画笔 |
| writer_maintoolbar_share | [1021,56][1098,133] | 分享 |
| writer_maintoolbar_backBtn | [1105,56][1182,133] | 关闭 |

**结论性观察：工具栏不存在独立保存按钮控件。** V1-V7 期间 D6 疑似的"工具栏保存按钮"坐标区域 (186,91)-(263,168) 实际位于 indicator（[102,56][179,133]）与 undo（[270,56][347,133]）之间的无控件空白区。

### 3. 一次点击历史坐标观察

- 点击坐标：(224,129)（疑似区域中心）
- logcat（`logcat -d -s WpsSaveDetector:V`）：无任何 WpsSaveDetector 事件行
- stat：mtime=1792552439、size=9164，点击前后无变化（未写盘）

### 4. 对照证据（正确保存入口行为正常）

- indicator 下拉菜单"保存"项（bounds [107,132][422,209]，中心 (264,170)）：本会话两次点击均正常触发保存写盘（11:01 mtime/size 变更 + WPS savetemp→rename 中间文件链系统日志；11:07 同）。
- ESC/返回键触发保存确认对话框路径：行为正常（11:07 D6 文本经此路径落盘）。

## 定性结论

**坐标问题**（manual-steps.md 附 D6 结论二选一之第一种）：

V1-V7 期间 D6 疑似的"工具栏保存按钮"一次点击无效，根因是历史坐标 (186,91)-(263,168) 落在 WPS 工具栏的无控件空白区（indicator 与 undo 之间），点击未命中任何保存控件；WPS 移动版编辑页工具栏本身不存在独立保存按钮，真实保存入口为文件菜单（indicator）下拉的"保存"项与 ESC/返回触发的保存确认对话框，两入口经 dump 坐标点击行为均正常。

按 PM 裁定：结论仅归档，不做代码修复立项，不影响 Gate-UI-2 关闭。