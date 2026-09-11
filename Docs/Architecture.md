# 工程架构蓝图

## 状态与技术基线

本文件为完整实现蓝图，目前已实现阶段 0–2。实际范围见 [阶段 2 记录](Stage-2.md)，不能把下文监听、活动和通用接口草案视为已有能力。技术基线为 Electron + TypeScript + React + Three.js + SQLite，首版 Windows，依赖由 package.json 与 package-lock.json 锁定。

阶段 2 的 Scanner 在 Utility Process 中单任务异步扫描，64 条批量事务、数据库目录队列、两轮枚举核对。IndexStore 拥有 schema 2、精确容量、查询和持久化槽位；Main 的 catalog-ipc 只处理选择器令牌、来源校验与系统操作。Renderer 使用 WorldHome / RealWorld 和既有 CityRenderer，每页最多 60 个普通对象，成员与搜索均分页。现阶段通过有界轮询获取进度，不发送蓝图中的变更事件流。

真实布局按首次发现顺序分配持久槽位，之后新增填空、删除留空；分组使用初始相对路径哈希和类型，已保存的分组键保持稳定。不同新建世界的枚举顺序不保证一致，不宣称跨新索引坐标完全一致。阶段 1 的确定性样例算法仍单独保留。真实布局版本与数据库版本分离。

阶段 0 选择内置 node:sqlite，由后台 IndexStore 封装；构建使用 electron-vite，打包使用 electron-builder。监听暂定以 node:fs.watch 配合核对队列作为首个验证候选，尚未实现，也未经大目录负载验证。无需为了这些可替换依赖改变模块边界。

## 进程与模块

```text
Renderer：React 界面 + Three.js 渲染 + 本地交互状态
    ↕ preload 中按功能暴露的受控接口
Main：窗口、目录选择、系统打开、任务生命周期、请求路由
    ↕ 有类型的请求与批量事件
Utility Process：扫描、监听、SQLite、搜索、统计、布局
```

Renderer 不直接使用 Node/fs，也不接收通用执行命令接口；启用上下文隔离和适当的渲染进程沙箱。Main 不递归扫描、不做大型统计计算。Utility Process 使用异步、有限并发的采集队列，大批计算分块让出事件循环；有实测阻塞后再引入额外计算 worker。

后台进程是 SQLite 唯一所有者，统一排队写入与事务。界面不读数据库文件。扫描事务采用有限批量，避免长事务阻塞搜索；进程重启后重新连接索引并显式报告任务中断。

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| DesktopHost | 窗口、选择目录、系统操作、进程恢复 | 文件遍历、沙盘布局 |
| FileCatalog | 文件系统适配、路径与身份核对、扫描范围 | 视觉样式 |
| ScanCoordinator | 扫描队列、暂停取消、检查点、错误汇总 | 逐帧渲染 |
| ChangeMonitor | 事件合并、脏目录队列、重新核对 | 将事件直接当完整事实 |
| IndexStore | SQLite 迁移、事务、分页查询 | UI 状态 |
| SearchService | 中文与片段检索、排序、分页 | 文件正文搜索 |
| AggregateService | 目录汇总、完整性、活动聚合 | 装饰灯光 |
| LayoutService | 稳定地块、聚合成员、布局版本 | 文件系统写入 |
| WorldRenderer | 镜头、实例绘制、拾取、LOD、动画 | 全盘载入索引 |
| ThemeRegistry | 语义样式与模型资源 | 文件大小、空间位置 |
| NavigationStore | 路径、历史、选中、镜头恢复 | 扫描真相 |

建议源目录为 `src/main`、`src/preload`、`src/renderer`、`src/backend`、`src/shared/contracts`；视觉资源位于 `assets/themes`。共享模块只定义契约和纯数据，不反向依赖桌面或渲染实现。

## 数据模型

阶段 1 的 `src/shared/world/model.ts` 提供纯样例数据结构和布局算法；`src/renderer/demo/fixture.ts` 是固定数据适配器，不是文件系统采集器。小样例由 Renderer 组织调用并保存于样例专用 localStorage 键。阶段 2 已由后台 IndexStore 承接真实索引与布局，Renderer 不复用样例全量遍历处理磁盘数据。

数据库主键使用应用生成的稳定 ID，不以路径作为永久主键。路径用于定位，Windows 文件身份信息在可可靠获取时辅助识别改名；路径匹配只作回退。无法确认改名时按删除与新增处理。

| 实体 | 核心字段 |
| --- | --- |
| World | id、rootPath、范围/排除配置、scanState、lastVerifiedAt |
| Entry | id、worldId、parentId、name、relativePath、kind、logicalBytes、mtime、可选文件身份、访问状态、lastSeenScanId |
| DirectoryAggregate | directoryId、bytes、fileCount、directoryCount、completeness、excludedCount、errorCount、revision |
| RepositoryMarker | directoryId、markerKind（.git 目录或文件）、detectedAt |
| ScanJob | id、worldId、state、checkpoint、discoveredCount、错误摘要、startedAt |
| ChangeRecord | entryId、kind、observedAt、mtime、source、scanId |
| Layout | worldId、directoryId、algorithmVersion、revision、extent、reservedSpace |
| Placement | layoutId、objectId、objectKind、矩形/槽位、groupId |
| AggregateGroup | id、directoryId、稳定分组键、成员分页索引、revision |
| ViewState | worldId、directoryId、camera、selection、mode、themeId |

文件字节数在存储和聚合中保持精确整数；跨进程以十进制字符串传递，视觉计算才转换到受限数值。时间统一为 UTC，展示转换为本地时区。

目录完整性至少区分 unknown、partial、complete、unavailable，不能用大小为零替代未知。逻辑大小按目录项汇总，硬链接可能重复计入；不宣称等同于磁盘实际占用或唯一数据量。

SQLite schema 具有独立迁移版本，布局具有独立算法版本。布局失效可重建但应告知用户；索引损坏的恢复动作只作用于应用数据，不能操作源目录。活动记录需有保留期限，建议首版默认 30 天，超过期限清理记录不改变文件索引；该值是实施默认值，可在后续设计调整。

## 接口契约

Renderer 通过 preload 的 `catalog` 判别联合请求调用当前业务：choose/create/worlds/scan/remove/scene/search/members/resolve/saveView/system，精确定义和校验见 `src/shared/contracts/catalog.ts`。下面完整方法表仍是契约草案，不是已实现 API。

| 请求 | 主要输入 | 输出/行为 |
| --- | --- | --- |
| worlds.chooseRoot | 无 | 原生选择器的结果；取消不创建世界 |
| worlds.create/list/remove | 选择结果引用、配置 / worldId | 世界摘要；remove 仅清理应用记录 |
| scans.start/pause/resume/cancel | worldId、jobId | 任务状态，命令可重复处理 |
| directories.getScene | worldId、directoryId、detailLevel、cursor | 有限场景页、布局 revision、统计完整性 |
| entries.getDetails | worldId、entryId | 元数据、允许动作、当前可用性 |
| groups.listMembers | worldId、groupId、query、cursor | 分页文件摘要 |
| search.query | worldId、query、cursor、requestId | 分页结果、索引完整性 |
| navigation.resolve | worldId、entryId | 祖先链、目标目录、揭示目标所需引用 |
| layouts.reorganize | worldId、directoryId、expectedRevision | 用户主动整理当前层；返回新布局 |
| views.save/load | worldId、directoryId、viewState | 有界保存状态，不逐帧写盘 |
| system.open/reveal/copyPath | worldId、entryId | 主进程核对后执行或返回明确错误 |

IPC 返回统一结果：成功含 data、revision；失败含 code、用户可读 message、retryable。区分 NOT_FOUND、ACCESS_DENIED、ROOT_UNAVAILABLE、STALE_REVISION、CANCELLED、INTERNAL_ERROR 等。

事件包括 scan.progress、scan.stateChanged、catalog.changed、layout.changed、backend.stateChanged。事件带 worldId、jobId（如适用）、递增 revision 和有限摘要；不在每次变化中传完整目录树。

搜索取消或过期请求的结果不得覆盖较新查询。场景响应也按目录和 revision 核对。事件序号出现缺口时拉取当前快照。Renderer 不消费时应合并更新并发送“需要刷新”标记，避免无限缓冲。

主进程按 ID 从可信索引解析路径，核对范围、存在性和链接策略；不执行 Renderer 提供的任意路径命令。系统调用使用结构化参数或系统 API，不拼接 shell 命令字符串。目录链接首版仅支持定位链接本身，默认禁用通过应用打开范围外目标。

## 扫描与一致性

1. 验证根目录与扫描配置，建立任务，先呈现缓存或已发现一级结构。
2. 有限并发遍历，分批写入索引；每个目录记录枚举结果与完整性。
3. 增量更新祖先统计，合并后发布界面摘要；在队列安全点处理暂停与取消。
4. 只对已成功完整枚举的目录判定缺失项；权限失败、断盘、取消不得触发批量误删。
5. 尽早启动监听并记录扫描期间的脏目录，初次扫描后再核对；重复事件应幂等处理。
6. 监听溢出、异常、后台重启、根目录恢复时重新核对相关范围，提供手动刷新入口。

暂停后允许已开始的小批次完成并保存检查点。跨进程重启后的继续扫描必须核对检查点对应目录，不能假设扫描期间磁盘不变。

活动分为基于 mtime 的初始推断与 observedAt 的已观察变化。应用重新扫描不能把所有现有文件记成“刚刚新增”。活动分数采用时间衰减与单文件贡献上限；具体权重在活动阶段用样例验证，不影响原始数据。

Git 识别接受 `.git` 目录或文件；仅作为仓库标记，不递归统计 `.git` 时必须明确属于用户选择的排除规则，不能因识别仓库就偷偷改变容量口径。

## 布局与渲染

- 初次布局使用确定性排序和矩形分区，保存结果后以稳定 ID 定位。
- 分组先按类型，再按持久化桶容量分配；展示顺序可按名称排列，成员不会仅因名称排序插入而整体换组。
- 保留有限空位；新增填空、删除留空、变大改高度。空间不足优先局部扩展或增加聚合，最后才扩大当前沙盘边界。
- 搜索揭示优先使用组内临时展示位，不为一次搜索重排城市；离开后可恢复聚合状态。
- 高度使用固定的单调压缩函数与上下限，例如对数映射；参数属于视觉编码规则，不由主题改变。到达上限后依靠详情辨别精确大小。
- Renderer 只缓存当前层及有限的相邻/历史场景，按内存预算淘汰；不会把全盘索引转成三维对象。
- 同类模型按几何与材质实例化；使用实例 ID 到 entry/group ID 的映射拾取。不能为每次选中重建全部实例。
- 标签和阴影设独立预算，按距离与优先级显示。窗口失焦或最小化降低渲染开销；静态场景按需渲染。
- WebGL 上下文丢失时显示恢复状态，尝试重建图形资源；失败后提供列表入口，不影响索引。

主题契约包括 palette、buildingFamilies、districtStyle、lighting、environment、interactionIndicators、uiTokens。主题资源替换应释放旧 GPU 资源，保持场景坐标、镜头、选择和语义映射。首版以一组测试主题参数验证解耦，不制作完整科技主题。

## 工程准备结果与后续验证

- 当前兼容目标 Windows 10 22H2 / Windows 11 x64；阶段 0 仅生成解包应用，安装器与签名在交付阶段实现。
- SQLite：在打包后的后台进程中验证加载、事务、迁移；大索引与异常中断恢复仍需后续验证。
- 监听方案：验证大目录事件量、句柄/内存、漏报恢复、暂停与退出。
- 搜索索引：验证中文、单字符、路径分隔符和名称片段；不能把普通全文分词等同于任意子串匹配。
- 基准机器与数值性能门槛：在第二阶段实现前固定并记录。

## 官方参考

- Electron Utility Process：https://www.electronjs.org/docs/latest/api/utility-process
- Electron 安全边界：https://www.electronjs.org/docs/latest/tutorial/security
- Three.js 实例绘制：https://threejs.org/docs/pages/InstancedMesh.html
- SQLite FTS5：https://www.sqlite.org/fts5.html

这些是能力参考；项目性能和 Windows 打包可用性仍须以实际实现验证。
