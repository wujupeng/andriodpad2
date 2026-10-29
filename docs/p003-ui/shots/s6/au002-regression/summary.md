# AU-002 回归冒烟结果

## A. AU-001 7 场景回归冒烟

| 场景 | 描述 | 结果 | 断言数 |
|------|------|------|--------|
| TC01 | 启动自动检查-无更新 | PASS | 1 |
| TC02 | 启动自动检查-有更新 | PASS | 2 |
| TC06 | 防降级 | PASS | 1 |
| TC09 | 检查失败不阻塞 | PASS | 1 |
| TC13 | 冻结区边界审查 | PASS | 3 |
| TC14 | 零新增 npm 依赖 | PASS | 1 |
| TC15 | 三项静态检查 | PASS | 3 |

**AU-001 回归结论：7 场景全部 PASS，AU-002 变更未破坏 AU-001 功能。**

## B. 业务功能回归冒烟

### SMB 主链路
- 连接：192.168.2.3 / share / debian → **已连接** ✅
- 浏览：共享目录文件列表正常显示（apk/app/bit/...等文件夹 + 标签模板3.dwg/测试A.txt等文件）✅
- 截图：smoke-01 ~ smoke-05

### 网络恢复
- 断网（svc wifi disable）→ 文件列表保持缓存 ✅
- 恢复（svc wifi enable）→ 连接状态维持"已连接" ✅
- 截图：smoke-06 ~ smoke-08

### 截图清单
1. smoke-01-main-screen.png — 主界面
2. smoke-02-smb-config.png — SMB 配置表单
3. smoke-03-smb-connected.png — SMB 连接成功
4. smoke-04-workbench.png — 工作台（连接状态）
5. smoke-05-smb-browse.png — SMB 文件浏览
6. smoke-06-wifi-off.png — 断网状态
7. smoke-07-wifi-back.png — 恢复网络
8. smoke-08-reconnected.png — 重连后工作台

**业务功能冒烟结论：SMB 连接/浏览/网络恢复均正常，无回归。**