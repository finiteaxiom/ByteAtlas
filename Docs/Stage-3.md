# 阶段 3：首版稳定性、状态交互与 0.2.0 验收

## 2026-09-13 状态校正

现场 HEAD 为 `56d236d`，此前实现已提交；下文“未提交工作区”和候选哈希是 2026-09-12 历史状态。当前安装器候选 SHA-256 为 `65EB173A30B1F0C590C75D20CE5C50DF1018EE3B1FA75B6DD7B473CF1827B661`，已现场计算并与 `dist/SHA256.txt` 核对。该构建没有继承下文旧候选的安装/升级验收，且早于本页所记的 2026-09-13 源码视觉重构。用户对现有视觉样板仍不满意，下一步重构不视为已完成。本次文档核对没有重新执行运行、安装或耐久验收；历史“正在运行”须在接续时查 checkpoint 和进程，不能直接当作实时状态。完全访问权限下遵循 [开发代理边界](../AGENTS.md) 第 0 节。

2026-09-13 后续开发样板加入本地离线 CC0 专业资源与 PBR 管线，资源清单为 `assets/themes/professional/ASSET-MANIFEST.md`。隔离 capture 证明资源可加载，未改变安装/升级、监听耐久、签名或兼容性验收状态。完整高保真建筑组装和专业植被可靠风动仍是体验层待办，不得拿本次开发构建替代旧安装器验收。

2026-09-14 的开发态岛屿环境把城市外围由矩形承托面改为“中心城市—过渡绿地—海岸—海水”。环境身份由目录稳定 ID 与后台已知槽位数决定，当前页、搜索、聚合揭示和缩放不改变岛形；海水及海岸对象不进入文件统计、拾取或系统操作，且不改真实槽位。`.artifacts/development-I4sIpX/report.json` 的隔离 smoke 通过稳定环境、海水空白点击、探索/总览边界、聚合/搜索和导航；`.artifacts/motion-capture-LILpUp/` 是实际硬件连续 PNG 画面证据。`.artifacts/graphics-benchmark-oi2tvA/benchmark.json` 记录动态开启 844.8 ms 最大帧间隔及 783,416 KB 峰值工作集，故本轮只说明可运行与资源生命周期检查完成，不得称性能或首版体验验收通过。现有 `dist` 安装器仍早于该源码。

### 2026-09-13 写实材质、高密度城市鸟瞰重构（开发态，待用户评审）

- 已实现：用户确认的美术方向从低多边形温暖微缩城镇调整为写实材质的高密度城市鸟瞰。共享 `CityRenderer` 现在以共享的项目内程序化 PBR 表面（砖、混凝土、沥青、金属、玻璃、屋顶和木质）构成连续道路、人行道、路缘和沿街建筑；代码、文档、媒体、仓储及通用建筑有不同几何轮廓和重复楼层模块。默认相机只显示局部街区，显式“俯瞰全部”才展示全范围。保留真实世界持久槽位、全局文件高度映射、60 个普通对象预算、实例化和目录/聚合的概况语义；没有静默布局迁移或虚构文件建筑。
- 代码与样例：扩展名驱动的 `media`（视频/音频）仍不读取正文，旧 `other` 索引值保持有效，未触发 schema 或布局迁移。样例为 113 个文件、10 个目录，明确“未扫描电脑”；真实 fixture 使用相同渲染与交互路径。顶部仍为“我的世界”、返回、面包屑、搜索与三种模式；详情默认关闭，选中后使用高度受限的约 300px 右上浮层，图形失败仍由同源列表访问。
- 本轮验证：`npm.cmd run build` 通过；隔离 `npm.cmd run smoke` 通过，证据 `.artifacts/development-OK6yeQ/report.json`：schema 3、sandbox/contextIsolation、40 draw calls / 8,024 triangles / 8 个可见对象 / 33 张 128×128 纹理（2,162,688 B）、进入/返回、聚合/中文搜索、滚轮/平移/右键旋转/真实拾取和双击进入均通过。最终 720×720 隔离 smoke 见 `.artifacts/realistic-density-final-narrow-720/report.json`；已查看其 `town-overview.png`。同一当前源码的软件离屏截图还包括 `.artifacts/development-OK6yeQ/town-overview.png`、`window.png`、`groups.png`、`activity.png` 与 `real-world.png`。这些结果不证明硬件性能或用户已认可。
- 图形硬件记录：最终源码的 `npm.cmd run benchmark:graphics` 已在 `.artifacts/graphics-benchmark-V6RI5y/benchmark.json` 完成；RTX 4060 Laptop 的 ANGLE D3D11 硬件绘制、1186×682 CSS 画布、113 文件/10 目录条件下为 40 draw calls、8,024 triangles、33 张纹理、首场景 338.9 ms、rAF P50/P95/最大 6.1/6.4/161.2 ms、峰值工作集 450,048 KB。真实 context loss/restore、构造失败、两种失败中的列表导航及重新加载恢复均通过，`benchmark-progress.json` 为 `complete`。此前两次无报告 artifact（`graphics-benchmark-JKsqSo/`、`graphics-benchmark-BwpiCh/`）保留：根因为测试在第一次恢复后继续使用旧 WebGL context 的扩展对象；基准现已重新取得活动 canvas/context，并写入阶段进度以保留后续故障证据。最大帧间隔仍显示一次明显停顿，不能据 P95 宣称全程流畅。

### 2026-09-13 城市取景、建筑细节与环境动态（开发态，待用户评审）

- 已实现：核对后删除了图片/影音建筑屋顶的圆形亮蓝玻璃装饰片，而非仅换色；屋顶仍保留女儿墙、屋檐或必要的金属结构。玻璃改为低饱和灰绿，采用共享窗框、窗台和凹陷层次，未给每扇窗新建独立高成本对象。普通探索以场景范围、可用画布及详情避让设定缩放/平移边界；显式“俯瞰全部”与返回街区保留独立会话相机状态，不写回槽位或已保存数据。树冠以稳定相位轻摆，环境动态可关闭，首次运行尊重减少动态、不可见时暂停；它是装饰，和活动/真实读写无关。
- 本轮验证：当前源码 `npm.cmd run build` 和 `npm.cmd run smoke` 通过，`.artifacts/development-wAv8pQ/report.json` 记录 schema 3、sandbox/contextIsolation、40 draw calls、14,024 triangles、36 张纹理、探索/总览、缩放/四向平移边界、环境动态开关、进入/返回、搜索与真实 SQLite fixture 均通过。720×720 独立运行 `.artifacts/city-dynamics-final-narrow-6fac5e1cbcf3483880f2484e2d526262/report.json` 亦通过，已查看其 `town-overview.png`，窄窗口仍以叶形按钮提供环境动态开关。硬件复测 `.artifacts/graphics-benchmark-24muPB/benchmark.json` 的开启/关闭数据见 [性能记录](Performance.md)；开启时 261.2 ms 最大帧间隔是未解决的卡顿证据。
- 连续画面证据：`npm.cmd run capture:motion` 在 `.artifacts/motion-capture-WLIzw2/` 保存 0、4、8、12、16、20 秒的实际硬件窗口 PNG 与 `motion-capture.json`，覆盖默认、动态关闭、探索最远缩放、俯瞰全部、进入/返回和搜索。系统没有可控的既有录屏程序，未安装系统级录制工具，因此没有伪造 MP4；这些连续帧仅用于视觉/交互回归，仍待用户评审。
- 候选边界：本轮没有运行 `npm run dist`、安装、升级、卸载或监听耐久；现有 `dist` 安装器早于上述源码，不能用于评价本轮体验。阶段 3 其余卸载残留、耐久、Windows 10/其他 GPU/ACL/签名限制仍原样保留。

### 2026-09-13 植被精细化与可感知风动（开发态，待用户评审）

- 已实现：核对原实现后确认“树”只有一个 `IcosahedronGeometry` 树冠且草坪只是纯色平面；开关与调度已接通，问题在模型和风动层次而非开关失效。现在以稳定 seed、共享实例建立树干、三条固定根部的分叉、六个不规则叶簇，以及有基础地表与根部固定草叶的草簇。分叉、叶簇和草叶沿同一风向、空间相位与缓慢阵风分层运动；没有整棵树绕根旋转、全场同步摆动或伪造文件活动。关闭时 `windBlend` 平滑归零并停止连续绘制；减少动态、失焦和不可见状态沿用现有调度边界。目录、聚合、文件高度、槽位、统计、导航和 IPC 均未改变。
- 本轮运行与画面证据：`npm.cmd run capture:vegetation` 在隔离的 `.artifacts/vegetation-capture-CGXsFs/` 产生真实硬件窗口的同机位关闭 5 秒、开启 10 秒、关闭 5 秒连续 PNG 和 `vegetation-capture.json`。开启时 `windBlend` 从约 1 收敛并保持，最终关闭后为 0；场景为 8 棵树、48 个叶簇和 89 个草簇。已目视检查 `vegetation-05-off.png`、`vegetation-09-on.png`、`vegetation-16-close-on.png` 与 `vegetation-20-off.png`：近景可见分叉、分层叶簇和草簇，开启/关闭为同一真实场景的不同状态。机器没有可控的既有录屏程序，未安装录制工具，故没有伪造 MP4；连续帧不等同人工手感或用户认可。早期 `.artifacts/vegetation-capture-dP1nLa/` 保留为失败证据：隔离捕获窗口遭 Chromium 后台节流，`windBlend` 未及时归零；只对隔离 capture/benchmark 窗口关闭该节流后才完成复验，普通应用可见性调度未放宽。
- 自动验证与硬件测量：最终 `npm.cmd run build`、`npm.cmd run smoke`（`.artifacts/development-Ole5FJ/report.json`）和 `npx vitest run tests/world.test.ts tests/catalog.test.ts tests/contracts.test.ts --reporter=verbose`（19/19）通过；smoke 新增分层植被预算检查并仍覆盖 sandbox/contextIsolation、schema 3、目录/搜索/相机/开关与真实 SQLite fixture。`npm.cmd run benchmark:graphics` 的有效硬件复测为 `.artifacts/graphics-benchmark-tD7b9o/benchmark.json`：RTX 4060 Laptop / ANGLE D3D11、1186×682、113 文件/10 目录、新隔离 profile 下 51 draw calls、26,231 triangles、48 张纹理（3,145,728 B）、峰值工作集 473,264 KB；动态开/关 rAF P50/P95/最大分别为 6.0/6.6/188.5 ms 与 6.1/6.4/7.2 ms。context loss/restore、构造失败和列表回退通过。`188.5 ms` 仍是长帧失败证据，30 fps 是目标而非已通过结论；首次 `.artifacts/graphics-benchmark-UnSt5g/` 因基准窗口后台节流而出现 40.955 s 首场景和 324.666 s 最大间隔，保留且不用于比较。
- 当前限制：这是开发构建体验样板，树冠仍为程序化、低成本的分层模型，尚待用户评审其写实度和 3—5 秒默认视角可感知度；没有借此重新运行安装、升级、卸载或 24 小时监听验收，现有 0.2.0 安装器早于源码，仍不可用于评价本轮效果。

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
