# PAD2-HOTFIX-D2D3D5-001 L3 人工步骤卡（TASK-HF-06）

> 适用：L2 脚本（`scripts/hf-d2d3d5-verify.mjs`）不可自动化的 WPS 内交互部分。
> 场景断言与证据归档定义见 design.md 6.3；每张卡对应脚本场景的 `[人工步骤]` 暂停点。

## 通用注意事项

1. **WPS 拉起**（activity 不 exported，须 monkey）：`MSYS_NO_PATHCONV=1 adb shell monkey -p cn.wps.moffice_eng 1`；WPS 恢复上次会话即已打开的 test-render.docx。
2. **切回 PAD2**：`MSYS_NO_PATHCONV=1 adb shell am start -n com.pad2.filemanager/.MainActivity`。
3. **每步截图**：`adb exec-out screencap -p > docs/p003-hotfix-d2d3d5/shots/<场景号>-<步骤>.png`。
4. **坐标获取**（禁止视觉估算）：`adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml docs/p003-hotfix-d2d3d5/shots/` → 解析 bounds 后 `adb shell input tap <x> <y>`。
5. **每场景组前环境重置**：测试文件从服务器基线重新拉取（b5c8aa54 原始版或 df4b123b 当前版，按场景需要；服务器侧 `ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 "cp <基线副本> /mnt/share/test-render.docx"`）→ PAD2 页面重载（force-stop + 重启）→ 重新连接并打开 test-render.docx。
6. **logcat 采集口径**：`adb logcat -d -s WpsSaveDetector:V SaveAsDiscoveryService:V WpsDeliveryHandler:V`（脚本已按场景归档）。
7. adb 路径：`C:\Users\DELL\Android\platform-tools\adb.exe`（Git Bash 须 `MSYS_NO_PATHCONV=1`）。

## 卡 1「WPS 编辑保存」（HF-TC-D2-01 / d2-01，复现 V2 实测路径，规避 D6 工具栏坐标风险）

| 步骤 | 操作 | 命令/说明 |
|-----|------|----------|
| 1 | 确认 PAD2 已打开会话 | M2 页已显示"已打开: ...\test-render.docx"（脚本 requireSession 断言） |
| 2 | 拉起 WPS | `monkey -p cn.wps.moffice_eng 1`（见通用注意事项 1） |
| 3 | 进入编辑模式 | 点击文档正文区域（坐标经 uiautomator dump 获取） |
| 4 | 输入文本 | `adb shell input text "HF-D2-01 edit <n>"`（增量内容，确保 SHA 变化） |
| 5 | 系统返回键 | `adb shell input keyevent 4` → WPS 弹出保存对话框 |
| 6 | 点"保存" | 坐标经 uiautomator dump 获取（保存对话框按钮），截图 `d2-01-save-dialog.png` |
| 7 | 等待写回完成 | 保存后 WPS 停留在文档页；截图 `d2-01-saved.png` |
| 8 | 切回 PAD2 | `am start -n com.pad2.filemanager/.MainActivity` |
| 9 | 回到脚本 | 回车继续 d2-01 断言（SAVE_SUCCESS + 无误判） |

## 卡 2「WPS 另存为」（HF-TC-D2-02 / d3-01 / d3-02 / d3-03）

**通用流程**：拉起 WPS（同卡 1 步骤 2）→ 系统返回键触发对话框（或 WPS 菜单"另存为"）→ 另存为对话框：

1. 路径选择：uiautomator dump 解析目录树/路径栏控件坐标，逐级进入目标目录；
2. 文件名输入：dump 解析文件名输入框 bounds → `adb shell input tap` 聚焦 → 清空（长按全选/删除或 input keyevent）→ `adb shell input text "<新名>"`；
3. 确认（保存按钮坐标经 dump 获取）→ 截图 `d3-xx-saveas-dialog.png` / `d3-xx-saved.png`；
4. 切回 PAD2（同卡 1 步骤 8）→ 回到脚本断言。

**子表（按场景的目标组合）**：

| 场景 | 目标路径 | 文件名 | 预期（脚本断言） |
|-----|---------|--------|----------------|
| d3-01 | `/storage/emulated/0/Documents/` | 同名同扩展（test-render.docx，确认覆盖/共存提示按 WPS 实际） | Candidate level=A + saveAsFilePath 指向 Documents |
| d3-02 第一轮 | `/storage/emulated/0/Documents/` | 基名相关（test-render-v2.docx） | level=A |
| d3-02 第二轮 | `/storage/emulated/0/Download/` | 全新名同扩展（终稿评审版.docx；中文名用 `input text` 逐段或 ADBKeyboard，必要时可用拼音名 zhonggao.docx 等价替代并记录） | level=B（组合信号） |
| d3-03 各轮 | Documents/ → Download/ → 根路径 → Download/WPS Office/ → smb_cache/ | 任意新名 | 每轮 Scan path= 行覆盖 + 候选发现 |
| d2-02 | 任意（如 Documents/） | 任意新名 | SAVE_AS_DETECTED + evidence recorded |
| d3-04 | WPS 私有目录（Android/data/cn.wps.moffice_eng/，或直接跳过另存为） | 任意 | none found (safe fallback) |

> d3-03 的 Download/WPS Office/ 轮次同时验证 R-03（WPS 默认保存目录覆盖度——若该路径在 WPS 内不可直达，记录实际默认路径并对照 SCAN_PATHS，缺口按 design 4.4 在职责域②调参无需升级裁定）。

## 卡 3「取消另存为」（HF-TC-D2-03 / d2-03）

| 步骤 | 操作 |
|-----|------|
| 1 | 拉起 WPS（同卡 1）→ 触发另存为对话框（同卡 2 通用流程步骤 1-2，可仅走到对话框） |
| 2 | 点"取消"（坐标经 uiautomator dump 获取）→ 截图 `d2-03-cancel.png` |
| 3 | 切回 PAD2 → 回到脚本断言（UNCERTAIN，无 SAVE_AS/SAVE_SUCCESS 结论） |

## 附 D6 观察项（定向回归，PM 裁定 0.2.6-2 并入；10 分钟量级，不做代码修复立项）

**目标**：WPS 工具栏保存按钮一次点击行为定性（V1-V7 期间 D6 疑似坐标问题）。

1. PAD2 打开 test-render.docx → 拉起 WPS → 进入编辑模式 → 输入增量文本；
2. `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml` → 解析 WPS 顶部工具栏"保存"按钮 bounds（**禁止视觉估算**）；
3. `adb shell input tap <x> <y>` 一次点击 → 观察两者：
   - logcat：`adb logcat -d -s WpsSaveDetector:V`（是否出现中间文件事件行 / CLOSE_WRITE 行）；
   - stat：`adb shell stat -c '%Y %s' /storage/emulated/0/PAD2/smb_cache/test-render.docx`（mtime/size 是否变化）；
4. **定性结论**（二选一，归档入 final-test-report.md 附表）：
   - 坐标问题（dump 坐标点击未命中实际保存控件 → 换正确坐标后行为正常）；
   - 产品行为差异（点击命中且无任何保存事件 → WPS 工具栏一次点击不触发保存流程，须二次操作）；
5. 结论仅归档，**不做代码修复立项**。