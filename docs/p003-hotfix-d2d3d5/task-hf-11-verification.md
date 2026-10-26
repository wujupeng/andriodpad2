# TASK-HF-11 D5 真机验证汇总（HF-TC-D5-01~06 + V1/V4/V6 冒烟）

> 执行日期：2026-10-21（11:20~11:51）；设备：AJ7XJV6904H00320；APK：fix2 debug 变体（SHA-256 1a8b7a20…）；验证会话：smb_cache/test-render.docx（缓存 9164 字节，本地 SHA 5beb889a…，含 D3 期间 y/D6 增量编辑）。
> 服务器操作方式（关键执行经验）：**只读/写切换必须 systemctl restart smbd**——smbcontrol 无 reload 命令、`systemctl reload smbd`（HUP）不刷新已建立树连接（V5 既有事实的强化版）；且 restart 完成时刻必须先于脚本第二次回写（LLM 响应间隔引入的时序竞争需以回车延迟 ≥60s 规避）。

## 一、六场景结果（全 PASS）

| 场景 | 名称 | 结果 | 断言数 | 关键证据 |
|---|---|---|---|---|
| HF-TC-D5-01 | 成功态防覆盖 | PASS | 7 | ①11:34:03 回写 pass；②11:35:07 只读回写 STATUS_ACCESS_DENIED 后 **V4 仍=pass** ∧ details 首次证据快照；③history 追加 fail(执行回写)；④服务器 SHA 5beb889a |
| HF-TC-D5-02 | 失败态防覆盖（对称） | PASS | 6 | ①只读回写 V4=fail；②恢复写权限后回写成功（11:42:52 pass）**V4 仍=fail**；③history 含追加 pass 记录 |
| HF-TC-D5-03 | 步骤间隔离 + V1/V4/V6 冒烟 | PASS | 8 | V5/V6 类操作、服务器冲突模拟（CONFLICT-SIM 追加，远程 SHA f6fa6e95）、svc wifi 断网恢复后 **V4 行均不变**；V6 自身正确推进（远程 mtime≠基线 → 通过）；V1 冒烟合法 |
| HF-TC-D5-04 | 反向路径探测（GC-2 判定物） | PASS | 9 | ①快速连点回写 ×5（竞态注入）；②5 次成功回写**未将 fail 覆盖为 pass**（反向路径封闭）+ 无卡死中间态；③history 承载被挡成功事件；④交错触发后 V4 终态不变（details 一致，history 正常追加）→ **阴性结论：D5 不升级发布阻断** |
| HF-TC-D5-05 | 显式重跑语义 | PASS | 7 | ①全新会话回写 pass；②终态后再次回写被拒（拒绝隐式重置，history 追加）；③restartApp 页面重载后 **V1-V7 全部回到 pending**（显式重置等价物）；④重跑 V4 正确推进 pass |
| HF-TC-D5-06 | 导出日志一致性 | PASS | 8 | 导出 m2a-log-2026-10-21T03-50-58.txt；门禁段 V4=pass 与页面终态一致；历史段含 fail(执行回写) 同源快照 |

## 二、V1/V4/V6 冒烟（smoke-v1v4v6）

PASS：门禁表格 7 行完整；V1=通过（WPS 可打开，URI+基线 SHA）；V4=通过（回写成功，本地/远程/服务器三方 SHA 一致=5beb889a…）；V6 行存在（d5-05 重置后待验证态合法——其推进证据在 d5-03 已验证）。

## 三、脚本修正登记（2 处，均为脚本缺陷，产品行为无误）

1. **restartApp 后缺 M2 页导航**（scripts/hf-d2d3d5-verify.mjs restartApp）：force-stop 重启后 App 停在主页，后续 connectPage 的 setPwd/clickText 在主页找不到控件（且 '连接' 宽泛匹配误过断言）。新增 navigateToM2()（主页点"设置"→设置页点"M2 技术验证"行），手动验证选择器后落地。修正后 d5-02/d5-05 的 restartApp 流程正常。
2. **d5-04 ④断言过严**（同文件 d5_04）：原 `row === row0` 严格文本比较把"③刚断言过的 history 正常追加"误判为污染。修正为终态状态+details 前缀比较（剥离 history 尾部）。权威语义（design.md 6.3）为"终态与 history 自洽、无 fail/pending 显示为 pass 形态"。

## 四、执行偏差登记（3 项）

1. **d5-01 两次时序返工**：第一次用 `smbcontrol smbd reload`（命令不存在，命令链中断致 immutable 短暂未恢复，已即时修复）；第二次 restart smbd 完成时刻晚于脚本第二次回写（回写成功——时序假象），手动触发回写证实只读生效（STATUS_ACCESS_DENIED）且产品 fail 追加/终态保持逻辑正确。第三次以回车延迟 60s + 确认 restart 完成时刻（11:35:05）先于回写（11:35:07）后全过。返工期间额外产出 SMB 层只读生效性对照证据（smbclient 以 App 同源凭据 ACCESS_DENIED）。
2. **d5-06 前置态重建**：脚本序假定 d5-06 紧跟 d5-01（前置 V4=pass+history 含 fail），实际执行序经 d5-05（restartApp 重置 history）。以"只读态手动触发一次回写"重建前置态（11:50:25 fail 追加，V4 保持 pass）后执行。
3. **d5-03 冲突模拟副作用自愈**：CONFLICT-SIM 追加使服务器文件暂为 f6fa6e95（9177 字节）；d5-04 的 5 次成功回写将本地内容写回，服务器恢复 5beb889a（9164 字节）——三方 SHA 一致由 d5-06 前置与冒烟断言确认。

## 五、产品补丁

无（本任务全程未改动产品代码）。

## 六、证据索引

- 各场景：shots/d5-01~d5-06-{logcat.txt,result.json}；d5-06 导出文件 shots/d5-06-m2a-log-*.txt；smoke：shots/smoke-v1v4v6-*。
- 页面终态：shots/d5-final-state.png。
- 服务器终态：SHA 5beb889a36fd4ae2d76c828b860109bdaeb53142ffcd25861c7f9d4a12eef7ca（与本地/页面一致）。

## 七、DoD 核对

- [x] 六场景全部通过（含 D5-04 反向路径探测阴性结论）
- [x] V1/V4/V6 冒烟通过
- [x] 证据归档