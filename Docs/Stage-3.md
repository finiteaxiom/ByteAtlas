# 阶段 3：首版稳定性、状态交互与 0.2.0 验收

## 当前状态（2026-09-12）

阶段 3 的核心实现已进入未提交工作区：监听核对、最近 24 小时活动模式、Git 标记、schema 3 迁移、后台恢复、0.2.0 图标和版本资源均已具备。当前候选安装器为 `dist/ByteAtlas-0.2.0-windows-x64-setup.exe`，SHA-256 `DFF441E83A60338CBEF0D91A73552AFAA1252C05B8BD0BF4B4E153CCB71B5EC1`，Authenticode NotSigned；其存在不等于首版已交付。

- `.artifacts/catalog-load-WodYcN` 曾记录 100,000 项组超过 Vitest 10 分钟上限；该失败证据保留。随后修复扫描批次的重复 SQLite 聚合与根路径重复解析，并在相同门槛下完整复测：10,000 / 100,000 / 密集 20,000 项双轮扫描分别为 13.88 / 156.12 / 47.69 秒，全部低于 180 秒门槛。该后台基准不替代硬件桌面渲染或完整首版验收。
- `-1073741515`（`STATUS_DLL_NOT_FOUND`）曾在受限执行环境中令 GPU/renderer 退出；保留该失败诊断。开发 Electron、解包候选和安装副本的图形 DLL 哈希一致，最小且仍开启 sandbox/contextIsolation 的 Electron 窗口在同一受限环境也失败，而正常桌面宿主中当前候选已启动。因此已排除“当前 ByteAtlas 打包缺文件”这一解释，但尚未得到受限环境缺失的具体加载依赖；未修改驱动、系统设置或安全边界。
- 当前解包 smoke `.artifacts/packaged-MBYWO0/`、当前安装闭环 `.artifacts/installation-OKqDzU/` 均通过；后者确认 `/currentuser /S` 静默卸载后应用、卸载器和当前用户登记消失，profile 保留，等待 3.338 秒。1 万文件/100 目录硬件桌面基准 `.artifacts/desktop-catalog-Pv50nF/` 通过：扫描 18.156 s，首场景 18.318 s，rAF P50/P95/最大 6/6.5/104.1 ms，470,856 KB 峰值工作集，60 个可见对象。
- `0.1.0→0.2.0` 在 `.artifacts/upgrade-ypOBB8/` 已完成真实同目录升级：升级前后的 schema 均为 3（因此不是 schema 2→3 的包级迁移证明），世界 ID、101 个条目、689 精确字节、布局摘要和保存视图在启动重扫前一致，当前安装副本随后恢复启动。严格脚本随后以非零退出记录最终静默卸载移除了卸载器和登记却留下当前 `ByteAtlas.exe`；这是真实失败，不能被安装闭环通过覆盖。
- 新增的可恢复监听耐久入口先以 20 秒预跑通过（实际 34.649 秒，见 `.artifacts/listener-endurance-run-H5GCbf/` 与 checkpoint），覆盖 270 目录 fallback、增改删改名、暂停/恢复、取消/重新扫描、离线恢复、句柄/脏队列上限与停止释放；随后已于 2026-09-12 21:08:55 +08:00 启动 24 小时运行。尚未满 24 小时，不能宣称耐久验收通过。
- 当前待办按顺序为：定位并复验跨版本链路中的卸载文件残留；等待并审阅 24 小时耐久；完成 Windows 10、另一 GPU、真实多账户 ACL 与签名验收。下一轮“阶段 3 稳定性修复、状态交互完善与 0.2.0 验收”仍是待实施计划。

## 已实现的行为与边界

- ChangeMonitor 只监听最近启动扫描的一个世界。它以非递归 `fs.watch` 订阅目录，不通过目录链接扩大范围；最多 256 个句柄、128 个脏目录引用，500 ms 合并。超预算、监听错误、漏报和根目录恢复均通过 Scanner 重新枚举及周期整世界核对处理。
- 事件只是核对提示，不是文件系统事实。普通事件局部核对；新目录会在核对中继续枚举。整世界核对后至少 60 秒才安排下一次周期核对；该间隔不是变化收敛承诺。
- 暂停保留事件，取消停止该世界监听；重新扫描或继续会启用监听。未被选为活动世界的世界保留缓存，不宣称实时更新。
- SQLite schema 3 从 schema 2 事务迁移，增加观察时间、变化类型、Git 标记和监听状态；保留世界 ID、索引、槽位、分组与视角。重启后重新核对，暂停/取消任务不自动恢复，也不删库恢复。
- 活动模式固定最近 24 小时。首次枚举仅按 mtime 推断；之后监听或已完成世界的主动重新扫描发现的变化记为 observed。它不代表文件被打开、阅读或运行。重复变化不累加，`node_modules`、`dist`、`out`、`build`、`.git` 的活动权重为 20%，容量统计不变；观察摘要保留 30 天。
- `.git` 普通目录或普通文件可标记其所在目录为 Git 仓库；链接不标记，不读取 `.git` 正文，也不运行 Git 命令。
- 后台异常退出会拒绝在途请求；后续请求合并重启，失败后至少 10 秒再尝试。只恢复最近运行世界的扫描。

## 当前 0.2.0 资源与验证状态

- `package.json` 与 `package-lock.json` 均为 0.2.0；`assets/icon.png`、`assets/icon.ico` 和 `assets/icon-256.png` 存在。构建出的 `ByteAtlas.exe` 可提取图标，Windows 资源为 ProductName `ByteAtlas`、ProductVersion `0.2.0.0`、FileVersion `0.2.0`。
- 2026-09-12 重建的 0.2.0 NSIS 安装器 SHA-256 为 `DFF441E83A60338CBEF0D91A73552AFAA1252C05B8BD0BF4B4E153CCB71B5EC1`；Authenticode 状态为 NotSigned。
- `verify:install -- --installer=<当前安装器>` 使用 assisted NSIS 的 `/currentuser /S /D=<隔离目录>`，并在卸载时使用 `/currentuser /S`。它先拒绝触碰已有普通 ByteAtlas 登记，再检查应用、卸载器、登记和 profile 保留，而非只看退出码。当前候选在 `.artifacts/installation-OKqDzU/` 完整通过。
- `benchmark:desktop-catalog` 会创建自有 10,000 文件/100 目录 fixture，在完整 Electron 进程中测扫描、可见对象、rAF 间隔和工作集；当前通过结果见本页“当前状态”，它不替代 10 万文件桌面绘制、冷缓存或跨 GPU 结论。
- `verify:upgrade` 要求 `--previous=<旧安装器>` 与 `--current=<新安装器>`；它在 `.artifacts` 下安装旧版、同目录安装新版，在 smoke 重建 fixture 前以只读 SQLite 快照比对世界、条目、精确容量、布局及保存视图。当前 0.1.0→0.2.0 通过数据保留和当前安装启动，但其卸载失败记录以非零结果保留在 `.artifacts/upgrade-ypOBB8/upgrade-report.json`。

## 历史验证证据（保留，不等同当前 0.2.0）

### 2026-09-11：0.1.0 安装副本

- 当时 `npm test` 记录为 31 项通过、1 项显式慢负载跳过；编译版与 Vite 开发服务自检通过，且已查看活动模式截图。
- `.artifacts/installed-stage3` 的 0.1.0 首次安装和**同版本覆盖安装**退出码均为 0；`.artifacts/packaged-7PHiON/` 的已安装副本 smoke 通过，包含真实目录、视角、活动截图、SQLite、隔离、后台正常退出和故障恢复。
- 测试卸载退出码为 0，独立安装目录中的 `ByteAtlas.exe` 已不存在，用户级卸载登记为 0 项。
- 该产物为 `ByteAtlas-0.1.0-windows-x64-setup.exe`，大小 114,637,860 字节，SHA-256 为 `BF94A8B485E01E05663D138225A7F574604C58252F8BD0B998879EF7C021A9D3`，签名状态 NotSigned。

以上仅证明当日的 0.1.0 副本、同版本覆盖和卸载路径；不证明 0.2.0 packaged smoke，也不证明跨版本升级或数据迁移。

## 本轮未通过、限制与待验收

1. 修复并复验已升级副本的静默卸载残留：当前 `upgrade-ypOBB8` 的卸载器和登记消失但 `ByteAtlas.exe` 残留；不能以独立安装链路的卸载通过掩盖它。
2. 等待并审阅当前 24 小时监听运行的完整 checkpoint / result；随后补充冷缓存、大文件混合树与高频变化的实测，不新设未经确认的性能门槛。
3. 完成 Windows 10、另一 GPU、真实 ACL 多账户测试。当前有注入 `EACCES` 的索引完整性回归覆盖；当前测试令牌下手工拒绝 ACL 仍可读取，不能当作真实 ACL 多账户通过。
4. 完成签名及发布前许可/分发检查。未签名候选产物不能称为正式首版发布。

## 依据

- [Node fs.watch 文档](https://nodejs.org/docs/latest-v24.x/api/fs.html#fswatchfilename-options-listener)：文件名可能缺失，事件和平台存在限制，因此保留元数据核对与周期恢复。
- [electron-builder NSIS 配置](https://www.electron.build/nsis/)：使用锁定工具链生成用户范围的辅助式安装器。
