# 阶段 0 工程准备记录

日期：2026-09-08。阶段 0 的骨架与本机验收已完成，可以进入阶段 1。此文记录实际实现与证据，不替代完整产品验收。

## 环境与支持范围

| 项目 | 实际情况 |
| --- | --- |
| 开发 Node / npm | 24.17.0 / 11.13.0 |
| Electron 运行时 | Electron 44.2.0 / Node 24.20.0 / Chromium 152.0.7977.76 / SQLite 3.53.4 |
| 操作系统 | Windows 11 家庭中文版 x64，10.0.22631 |
| CPU | Intel Core i7-14650HX |
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU |
| 内存 | 16 GiB |
| 应用兼容目标 | Windows 10 22H2 / Windows 11 x64 |
| 已测试平台范围 | 仅上述 Windows 11 本机；Windows 10 未验证，ARM64 不在首版范围 |

本次未做负载基准测试；实际桌面分辨率、磁盘类型和性能门槛在沙盘阶段测试时补充。截图窗口尺寸由自检固定，不能视为硬件原生分辨率。

## 依赖决策

| 依赖 | 锁定版本 | 说明 |
| --- | --- | --- |
| Electron | 44.2.0 | 稳定版；MIT，运行时采用显式安装步骤 |
| electron-vite / Vite | 5.0.0 / 7.3.6 | MIT；electron-vite peerDependencies 尚不包含 Vite 8 |
| React / React DOM | 19.2.8 | MIT |
| Three.js | 0.185.1 | MIT；已安装，三维场景在阶段 1 实现 |
| TypeScript | 5.9.3 | Apache-2.0；使用成熟的 5.9 工具链，暂不引入 7.x 迁移 |
| electron-builder | 26.15.3 | MIT；阶段 0 生成未签名解包应用 |
| Vitest | 3.2.7 | MIT；与 Vite 7 工具链配套 |
| SQLite 适配 | Electron 内置 node:sqlite | 不额外安装 native addon；IndexStore 为唯一适配边界 |

其余类型依赖和 React 插件见 package.json，完整解析版本见 package-lock.json。项目自身暂未选择开源许可证，以 private 与 UNLICENSED 标识，不擅自决定发布许可。运行时依赖自带许可证随打包工具保留，正式分发前检查完整许可清单。

node:sqlite 在 Node 24 文档中为 Release Candidate，尚非稳定 API。选择它可以减少 Electron ABI 重编译链路；代价是每次 Electron 升级必须复验 API 与数据兼容性。同步数据库调用只在后台进程执行，后续大批任务必须分块，避免搜索饥饿。

监听暂定 node:fs.watch + 脏目录核对队列，阶段 2 再验证链接、事件漏报、句柄与大目录负载；本阶段没有声称监听可用。中文和子串索引方案也留到真实目录阶段验证。

## 已建立的骨架

- Main 管理窗口、后台生命周期及受控健康检查；拒绝外部窗口、导航和权限请求。
- Preload 仅暴露 getHealth 与 getRuntimeInfo，界面无文件访问接口。
- Utility Process 独占 SQLite，迁移到 schema 1，事务记录启动次数并查询完整性；正常退出关闭数据库。
- React 提供温暖配色的工程入口，扫描按钮明确禁用。没有生成假目录、没有扫描用户磁盘。
- 分离后台和浏览器 TypeScript 配置；生产构建包含独立后台入口与单文件 preload。
- 自检使用隐藏、软件离屏绘制的 BrowserWindow，两次启动验证持久化，并保存 JSON 和非空 PNG。普通运行仍启用硬件加速；本次截图不证明 GPU 渲染或 Three.js 性能。
- 开发模式使用每次启动随机生成的 CSP nonce 兼容 React Fast Refresh，不开放任意 inline script；生产页面只允许本地脚本。

## 验证记录

- `npm install`：成功；精确依赖和锁文件已生成。沿用用户既有 npm registry，没有修改全局配置。
- `npm ls --depth=0`：依赖树无缺失或 peer 冲突。
- `npm test`：3 个文件、8 项测试通过；覆盖 IPC 参数、可信页面地址、迁移与重开、拒绝新版本 schema、损坏元数据不被覆盖。
- `npm run build`：类型检查与三个构建目标通过。
- `npm run setup:electron`：完成 Electron 44.2.0 Windows x64 运行时准备，使用包内校验和。官方源下载进展缓慢后停止该任务，单次改用 npmmirror 完成；没有持久修改下载源或代理配置。
- `npm run smoke`：通过，证据为 `.artifacts/development-tvwu8e/`。
- `npm run smoke:dev`：通过，两次启动本地 Vite 服务并自动退出，证据为 `.artifacts/dev-server-6cVnD8/`。
- `npm run pack`：通过，生成 `dist/win-unpacked/ByteAtlas.exe` 与 ASAR；复用本地已校验 Electron，避免打包工具重复下载。该文件需连同所在目录运行，不能只复制 exe。
- `npm run smoke:packaged`：最终产物通过，证据为 `.artifacts/packaged-jQJarU/`；`packaged=true`，启动计数 1 → 2，完整性 ok，后台退出码 0。
- 自检实际观测到 sandbox=true、contextIsolation=true、页面 require/process 均 undefined；多余参数被 BAD_REQUEST 拒绝。
- 已人工查看最终 1200×800 离屏截图，检查文字、卡片边界、禁用按钮与“本地索引已就绪”状态，没有可见截断。
- ASAR 清单检查：包含后台入口，不含 Docs、AGENTS.md、测试目录、自检产物或 SQLite 文件。

本地证据不加入版本控制；需要复查时使用上述命令重新生成。本次未初始化 Git，未提交、安装或发布应用。

## 验证中修正的问题

- electron-vite 与 Vite 8 的 peer 范围不匹配，因此锁定 Vite 7；没有使用强制安装绕过检查。
- 开发页面 URL 会自动补尾部斜杠，可信地址核对改用 URL 规范化，同时拒绝其他路径、查询和来源。
- Electron 44 类型声明不再提供此前使用的 WebContents 偏好读取接口；自检改为从 preload 的实际 process.sandboxed/contextIsolated 与页面 Node 可见性采集证据。
- 隐藏窗口 capturePage 曾返回 UnknownVizError，GPU 离屏绘制还曾产生空图；自检改为软件离屏 paint，校验非空 PNG，并等待界面完成绘制。未关闭 sandbox 或 contextIsolation。
- electron-builder 重复联网下载曾中断；改为使用已校验的本地 electronDist。没有删除缓存或调整系统网络设置。

安装提示了构建工具链中的 deprecated 传递依赖。尚未形成完整安全审计结论；不把安装成功视为不存在依赖风险。

## 后续阶段

阶段 1 开始固定样例数据的温暖城市、相机、聚合和稳定布局。真实扫描、完整业务索引、压力测试、异常中断恢复、安装器、签名与发布均尚未完成。

## 参考依据

- [Electron 稳定版本](https://releases.electronjs.org/?channel=stable)
- [electron-vite 配置](https://electron-vite.org/config/)
- [Electron Utility Process](https://www.electronjs.org/docs/latest/api/utility-process)
- [Node 24 SQLite 文档](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- Electron 44.2.0 已安装包的 package.json、index.js、install.js：核对按需下载行为；其 README 标明 Windows 10 及以上平台基础支持，但不等于本产品已在这些平台实测。
