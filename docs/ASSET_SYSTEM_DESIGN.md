# Esugoroku (絵双六) — V2.1 Modular Asset System Design Specification

## 1. 概述

本规范定义了 Esugoroku V2.1 资产系统的架构、数据格式、接口约定及平台适配边界。系统旨在将所有视觉、音频、三维模型及相关美术资源从业务代码中剥离，通过统一的 Asset ID 与资产清单进行管理，实现跨平台扩展与资源可替换性。

核心原则：
- **游戏逻辑不直接依赖资源文件路径**。游戏代码只通过稳定的 Asset ID 获取资源。
- **资产与玩法数据分离**。棋盘数据描述结构与规则；资产清单描述视觉与音频表现。
- **资产系统独立于具体平台**。当前运行环境是浏览器，但架构为未来的移动端和嵌入式小游戏预留扩展能力。

---

## 2. 目录结构

资产目录位于项目根目录下的 `assets/`，结构如下：

```text
Esugoroku/
├── assets/
│   │
│   ├── manifest/
│   │   ├── asset-manifest.json    # 主资产注册表
│   │   └── asset-schema.json       # 资产清单 JSON Schema 定义
│   │
│   ├── images/
│   │   ├── boards/                # 棋盘背景与主插画
│   │   │   ├── tokaido/
│   │   │   ├── yokai/
│   │   │   ├── kesshu/
│   │   │   └── genji/
│   │   │
│   │   ├── prints/                # 浮世绘切片与卡牌
│   │   │   ├── tokaido/
│   │   │   ├── yokai/
│   │   │   ├── kesshu/
│   │   │   └── genji/
│   │   │
│   │   ├── charms/                # 怀中守札图标
│   │   │
│   │   ├── ui/                    # UI 图标与界面图片
│   │   │
│   │   └── backgrounds/           # 通用背景图片
│   │
│   ├── audio/
│   │   ├── bgm/                   # 背景音乐
│   │   │   ├── tokaido/
│   │   │   ├── yokai/
│   │   │   ├── kesshu/
│   │   │   └── genji/
│   │   │
│   │   ├── sfx/                   # 音效
│   │   │   ├── common/            # 通用音效 (dice-roll, wood-clack, etc.)
│   │   │   └── board/             # 棋盘相关音效
│   │   │
│   │   └── ambience/              # 环境音 (可选)
│   │
│   ├── models/                    # Three.js 模型与纹理
│   │   ├── characters/            # 角色模型
│   │   │   └── kokeshi/
│   │   │
│   │   ├── props/                 # 道具模型
│   │   │   └── dice/
│   │   │
│   │   ├── boards/                # 棋盘 3D 模型
│   │   │   └── tokaido/
│   │   │
│   │   └── environment/           # 环境贴图与背景
│   │
│   ├── textures/                  # 独立纹理文件 (PNG/WebP/ktx2)
│   │
│   ├── fonts/                     # 字体文件 (WOFF2, TTF, OTF)
│   │
│   ├── effects/                   # 程序化特效与滤镜资源
│   │
│   └── packs/                     # 可下载内容资源包
│
├── core/
│   └── ...
│
├── mobile/
│   └── ...
│
└── docs/
    ├── ASSET_INVENTORY.md
    ├── ASSET_SYSTEM_DESIGN.md
    ├── ASSET_REPLACEMENT_GUIDE.md
    └── README.md
```

### 2.1 分组逻辑说明

- **`boards/`**：每种棋盘（东海道、妖怪、武将决集、源氏物语）拥有独立的背景与主插画子目录。未来新增棋盘时，仅需在清单中注册新的分组，无需重构资产管理器。
- **`prints/`**：按棋盘主题分类的浮世绘切片图片。切片图片遵循 `board.<id>.<sheet-key>` 命名规范。
- **`charms/`**：统一管理 3 种怀中守札图标。
- **`ui/`**：UI 图标、按钮背景、标牌等。
- **`audio/bgm/`**：每种棋盘对应的三味线/箏曲 BGM 变体。
- **`audio/sfx/`**：通用音效与棋盘特定音效分区。
- **`models/`**：Three.js 模型与纹理，按角色/道具/棋盘分类。
- **`packs/`**：未来 DLC 或主题棋盘资源包，通过清单中的 `group` 字段关联。

---

## 3. 统一资产清单格式

资产清单使用 JSON 格式，位于 `assets/manifest/asset-manifest.json`。清单是单一的真实来源，所有资源引用均从此处解析。

### 3.1 清单根结构

```json
{
  "schemaVersion": 1,
  "generatedAt": "2024-01-01T00:00:00Z",
  "source": "docs/ASSET_INVENTORY.md audit",
  "assets": {
    "board.tokaido.background": { ... },
    "audio.sfx.dice-roll": { ... }
  },
  "groups": {
    "board.tokaido": { ... },
    "audio.common": { ... }
  }
}
```

### 3.2 资产条目字段说明

每个资产条目必须包含以下字段（所有字段均为必填，除非标记为可选）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | **资产的唯一标识符**。使用点分层命名（如 `board.tokaido.background`），遵循 `namespace.type.name` 模式。 |
| `type` | `string` | **资源类型**。枚举值：`image`, `audio`, `model`, `font`, `effect`, `programmatic`。 |
| `path` | `string` | **相对于项目根目录的文件路径**。使用正斜杠 `/` 分隔，区分大小写（Linux 部署关键）。 |
| `group` | `string` | **资产分组**。用于分组预加载与逻辑关联。格式同 Asset ID 的前缀，如 `board.tokaido`。 |
| `platforms` | `string[]` | **适用平台列表**。枚举值：`web`, `mobile`, `embedded`。默认 `["web"]`。 |
| `variants` | `object[]` | **可选分辨率/质量变体**。每个变体包含 `suffix`（文件名前缀）和 `platform`（目标平台）。 |
| `metadata` | `object` | **扩展元数据键值对**。包含 `description`、`historicalStatus`、`license`、`attribution`、`source`、`sourceUrl` 等。 |
| `hash` | `string` (可选) | **校验哈希**（SHA-256 或类似），用于生产环境完整性验证。 |
| `fallback` | `object` (可选) | **缺失资源回退策略**。当资源加载失败时的备选方案。 |
| `loadStrategy` | `string` (可选) | **加载策略**。枚举值：`eager`（启动必需）、`lazy`（按需）、`deferred`（延迟）。默认 `lazy`。 |
| `version` | `string` (可选) | **资产版本号**，用于缓存失效与版本管理。 |

### 3.3 资产 ID 命名规范

资产 ID 采用 **点分层命名**，结构如下：

```
<namespace>.<category>.<specific> [<optional-variant>]
```

**命名空间与类别对照表**：

| 命名空间 | 说明 | 示例 |
|---|---|---|
| `board` | 棋盘相关资源 | `board.tokaido`, `board.yokai` |
| `piece` | 棋子/角色资源 | `piece.kokeshi`, `piece.player` |
| `card` | 卡牌资源 | `card.ukiyo-e`, `card.charm` |
| `ui` | UI 界面资源 | `ui.icon.dice`, `ui.button.start` |
| `audio` | 音频资源 | `audio.sfx.dice-roll`, `audio.bgm.main` |
| `model` | 3D 模型资源 | `model.kokeshi`, `model.dice` |
| `font` | 字体资源 | `font.shippori-mincho` |

**完整示例**：

```json
{
  "id": "board.tokaido.background",
  "type": "image",
  "path": "images/boards/tokaido/background.webp",
  "group": "board.tokaido",
  "platforms": ["web", "mobile", "embedded"],
  "variants": [
    { "suffix": "-2k", "platform": "web" },
    { "suffix": "-1k", "platform": "mobile" }
  ],
  "metadata": {
    "description": "Tokaido sugoroku board background",
    "historicalStatus": "historical-adaptation",
    "license": "UNVERIFIED",
    "attribution": "待核实"
  }
}
```

### 3.4 分组 (Groups) 结构

清单中还包含 `groups` 字段，用于逻辑分组与批量操作：

```json
{
  "groups": {
    "board.tokaido": {
      "description": "Tokaido board assets",
      "assets": ["board.tokaido.background", "board.tokaido.node-art", "board.tokaido.piece"],
      "preload": true,
      "platforms": ["web", "mobile"]
    },
    "audio.common": {
      "description": "Common sound effects used across all boards",
      "assets": ["audio.sfx.dice-roll", "audio.sfx.wood-clack"],
      "preload": false
    }
  }
}
```

---

## 4. Asset Manager 接口

AssetManager 是资产系统的核心模块，提供统一的资源访问接口。以下接口基于 ES Module JavaScript 实现。

### 4.1 核心接口

```javascript
import { AssetManager } from './assets/asset-manager.js';

// 通过 Asset ID 获取资源的 URL
const url = AssetManager.getUrl("board.tokaido.background");

// 直接获取资源对象（含元数据）
const asset = AssetManager.getAsset("board.tokaido.background");

// 预加载资源组
AssetManager.preloadGroup("board.tokaido");

// 预加载单个资源
AssetManager.preloadAsset("audio.sfx.dice-roll");

// 播放音效
AssetManager.playSound("audio.sfx.dice-roll");

// 停止/释放资源
AssetManager.disposeGroup("board.tokaido");
AssetManager.disposeAsset("audio.sfx.dice-roll");
```

### 4.2 详细方法说明

| 方法 | 签名 | 说明 |
|---|---|---|
| `getUrl(id)` | `string` | 返回该 Asset ID 对应的资源 URL。若资源不存在，返回默认占位图 URL。 |
| `getAsset(id)` | `object \| null` | 返回完整的资产条目对象（含 `id`, `type`, `path`, `metadata` 等）。若未找到，返回 `null`。 |
| `preloadAsset(id)` | `Promise<void>` | 预加载单个资源。对图片返回 `HTMLImageElement`，对音频返回 `HTMLAudioElement`/`AudioBuffer`。 |
| `preloadGroup(groupPrefix)` | `Promise<void>` | 预加载属于同一分组的所有资源。例如 `preloadGroup("board.tokaido")` 会加载该棋盘下的所有图像资产。 |
| `playSound(id, options?)` | `Promise<void>` | 播放音效资源。`options` 可包含 `volume`, `loop` 等。 |
| `disposeAsset(id)` | `void` | 释放单个资源的内存引用（图片 `img.src = ''`，音频 `audio.pause()` 并移除事件监听）。 |
| `disposeGroup(groupPrefix)` | `void` | 释放整个资源组的内存引用。 |
| `getAllAssets()` | `object[]` | 返回清单中所有已注册资产的数组。 |
| `validate()` | `{ valid: boolean, errors: string[] }` | 验证清单格式与路径有效性。 |

### 4.3 加载策略

AssetManager 在初始化时根据清单中的 `loadStrategy` 字段决定资源何时加载：

- **`eager`**：游戏启动时并行加载所有标记为 `eager` 的资源。适用于必须立即可见的核心资源（如首页棋盘背景）。
- **`lazy`**（默认）：仅在首次通过 `getUrl()` 或 `getAsset()` 访问时加载。适用于游戏过程中可能用到但不立即需要的资源。
- **`deferred`**：在特定游戏事件（如棋盘切换、动画开始）后加载。适用于大型 3D 模型或高分辨率纹理。

### 4.4 缓存与释放

- **图片缓存**：所有通过 `getUrl()` 获取的图片均自动缓存在 `ImageCache` 中。同一 Asset ID 的多次请求返回同一 `img` 对象引用。
- **音频缓存**：`AudioContext` 中的 `GainNode` 与 `AudioBuffer` 缓存。同一音效的多次播放复用同一缓冲区。
- **Three.js 资源**：`THREE.Texture`、`THREE.GLTFModel` 等需手动通过 `disposeAsset()` 释放。AssetManager 提供 `disposeGroup()` 方法，会遍历组内所有模型/纹理并调用 `.dispose()`。
- **内存监控**：提供 `AssetManager.getMemoryReport()` 方法，返回当前缓存的图片数量、音频时长、纹理尺寸等信息。

### 4.5 缺失资源处理 (Fallback)

当请求的资源文件不存在时，AssetManager 按以下策略处理：

| 模式 | 行为 |
|---|---|
| **开发模式** | 输出详细错误日志至控制台，包含 Asset ID、预期路径、可能的原因（大小写不匹配、文件未生成等）。 |
| **生产模式** | 返回预定义的 **fallback 占位资源**。fallback 资源路径在清单的 `fallback` 字段中配置。 |
| **回退策略** | 若清单中无 `fallback` 字段，则返回：<br>• 图片：透明 PNG 占位（`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...`）<br>• 音频：静音 0.1s WAV（`data:audio/wav;base64,UklGRl...`）<br>• 模型：带有“Missing Model”标记的基础几何体 |

**绝对禁止**在生产模式下静默使用完全不相关的资源。

### 4.6 平台适配器

AssetManager 通过插件式 **Adapter** 模式支持不同平台的资源加载差异。当前内置适配器：

| 适配器 | 说明 |
|---|---|
| `BrowserAssetAdapter` | 浏览器环境。使用 `fetch()` + `response.blob()` + `URL.createObjectURL()` 加载图片与音频。支持 CORS 与跨域图片。 |
| `MobileAssetAdapter` (预留) | 移动端环境。将在未来实现，支持通过 `cdv-plugin-file-transfer` 或原生文件系统访问。 |
| `EmbeddedGameAdapter` (预留) | AAA 游戏内嵌小游戏环境。通过模块化入口加载 Esugoroku 的资源包，避免依赖宿主游戏的资源路径。 |

**Adapter 接口约定**：

```javascript
// 所有适配器必须实现以下方法：
class AssetAdapter {
  // 将相对路径转换为平台特定的加载URL
  toLoadUrl(relativePath) { /* return string URL */ }
  
  // 平台特定的图片加载器
  loadImage(url) { /* return Promise<HTMLImageElement> */ }
  
  // 平台特定的音频加载器  
  loadAudio(url) { /* return Promise<HTMLAudioElement|AudioBuffer> */ }
  
  // 资源是否存在检查
  exists(url) { /* return Promise<boolean> */ }
}
```

---

## 5. 资源元数据与版权管理

### 5.1 元数据字段设计

每个资产条目的 `metadata` 字段建议包含以下键：

| 键 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `description` | `string` | 资源简短描述 | "Tokaido sugoroku board background" |
| `historicalStatus` | `string` | 历史状态枚举 | `original-source`, `historical-reconstruction`, `historical-adaptation`, `ai-generated`, `original-artwork`, `placeholder` |
| `license` | `string` | 已知许可信息 | `CC-BY-4.0`, `UNVERIFIED`, `public-domain` |
| `attribution` | `string` | 署名要求 | "Image courtesy of Tokyo National Museum" |
| `source` | `string` | 来源机构或原作者 | "Tokyo National Museum, Edo-period ukiyo-e collection" |
| `sourceUrl` | `string` | 原始来源地址 | "https://www.tnm.jp/collection/..." |
| `catalogId` | `string` | 馆藏或目录编号 | "TNM-Edo-1234" |
| `author` | `string` | 作者（若已知） | "Utagawa Hiroshige" |
| `createdDate` | `string` | 创建或上传日期 (ISO 8601) | "2024-01-15T00:00:00Z" |
| `tags` | `string[]` | 标签数组，便于检索 | `["landscape", "highway", "post-town"]` |

### 5.2 历史状态枚举

资源的 `historicalStatus` 至少区分以下 6 种状态：

| 状态 | 说明 |
|---|---|
| `original-source` | 可证实的原始历史素材（如馆藏原版画扫描图） |
| `historical-reconstruction` | 基于史料进行的复原（如根据古卷重绘的插图） |
| `historical-adaptation` | 基于历史内容制作的数字化改编（本项目主要类型） |
| `ai-generated` | AI 生成内容 |
| `original-artwork` | 项目原创美术 |
| `placeholder` | 临时占位素材 |

### 5.3 来源不明标记

当资源来源无法核实时，必须在 `metadata.license` 与 `metadata.attribution` 中标注：

```json
"license": "UNVERIFIED",
"attribution": "来源未核实"
```

**严禁**随意声称资源来自某个博物馆或具有某种开放授权。

---

## 6. 跨平台扩展能力

### 6.1 平台适配边界

资产系统为三种预定义的运行环境提供适配边界：

| 环境 | 当前支持 | 未来扩展方向 |
|---|---|---|
| **浏览器页游** (A) | ✅ 完整支持。本地资源加载、相对路径、本地部署、离线运行、按需加载、资源预加载与缓存。 | - 优化移动端触控体验<br>- Web Worker 预加载大型资源 |
| **手机版** (B) | 🔄 接口预留。建立清晰的适配边界，未来可通过 `MobileAssetAdapter` 加载移动端资源变体（更小的图片、压缩纹理）。 | - 加载 `*-mobile` 变体（如 `background-1k.webp` vs `background-2k.webp`）<br>- 内存使用控制<br>- 根据屏幕 DPR 选择资源质量 |
| **AAA 游戏内嵌小游戏** (C) | 🔄 接口预留。Esugoroku 作为独立模块集成。宿主游戏只需加载 Esugoroku 模块及对应资源包。 | - 独立资源清单<br>- 独立资源命名空间<br>- 资源版本号与校验信息<br>- 平台适配器接口<br>- 避免依赖宿主游戏的硬编码路径 |

### 6.2 资源变体示例

同一 Asset ID 可提供不同平台的资源变体：

```json
{
  "id": "board.tokaido.background",
  "type": "image",
  "path": "images/boards/tokaido/background.webp",
  "group": "board.tokaido",
  "platforms": ["web", "mobile", "embedded"],
  "variants": [
    { "suffix": "-2k", "platform": "web" },
    { "suffix": "-1k", "platform": "mobile" },
    { "suffix": "-ktx2", "platform": "embedded" }
  ]
}
```

**AssetManager** 在 `getUrl()` 时会根据当前运行环境自动选择合适的变体。若当前平台未配置变体，回退使用基础 `path`。

### 6.3 避免不必要的复杂依赖

- **不**为了支持尚未实现的平台而虚构文件或路径。
- **不**引入大型跨平台框架（如 Unity、Unreal 插件）。
- **不**在运行时依赖外部网络获取核心游戏资源。
- 所有适配器接口均为 **可选** 实现，核心功能在 `BrowserAssetAdapter` 上完全可用。

---

## 7. 迁移路径与 backward compatibility

### 7.1 逐步迁移策略

现有代码中直接引用资源的方式（如 `image.src = "/assets/tokaido.png"`）将被逐步替换为 AssetManager 接口：

```javascript
// 旧写法（将被弃用）
image.src = "/assets/tokaido.png";

// 新写法（推荐）
image.src = AssetManager.getUrl("board.tokaido.background");
```

### 7.2 过渡期兼容性

在迁移期间，保持双重支持：

1. **原始文件保留**：`mobile/assets/prints/`、`public/assets/aistudio/` 等原始目录保持不变，不删除。
2. **双重引用**：新代码优先使用 AssetManager，旧代码继续工作（但会在控制台输出迁移提示）。
3. **自动重定向**：AssetManager 内部可根据需要将旧路径映射到新路径，实现零代码改动的平滑过渡（视实际情况而定）。

### 7.3 程序化资源分离

对于无法通过统一 URL 访问的程序化资源（如 Three.js 动态生成的几何体、WebAudio 合成的音效参数），保留合适的生成接口，并将其参数配置与游戏逻辑分离：

```javascript
// 程序化生成接口（保留在 core/ 或 mobile/js/）
function generateKokeshiModel(options = {}) {
  // 根据 options 生成 THREE.Mesh
  // 与游戏规则（棋子移动逻辑）完全分离
}
```

配置参数将通过清单的 `metadata` 字段或单独的配置文件传递，而非硬编码。

---

## 8. 错误处理与边界情况

### 8.1 资源加载失败

当资源加载失败（网络错误、文件不存在、解析错误）时：

1. **记录错误**：`console.error(`Asset load failed: ${id}`, error)`。
2. **触发 fallback**：返回配置好的占位资源。
3. **统计计数**：`AssetManager.getStats().failedLoads` 加 1。
4. **开发模式**：弹出模态框（可配置）详细显示错误信息，便于调试。

### 8.2 循环引用防护

AssetManager 在预加载资源组时，会检测资源间的依赖循环，防止无限递归。若检测到潜在循环，记录警告并按优先级顺序加载。

### 8.3 跨域资源

图片加载时的 CORS 问题由 `BrowserAssetAdapter` 通过 `crossorigin="anonymous"` 处理。若服务器未正确设置 CORS 头，图片将被标记为 "tainted" 并无法在 canvas 中绘制。此类资源将被标记为有缺陷，并使用本地 fallback。

### 8.4 大文件分片

单个资源文件超过 10MB 时，AssetManager 支持分片下载与 Range 请求，但在 Esugoroku V2.1 中暂未启用（所有当前资源体积均在可接受范围内）。

---

## 9. 实施优先级

### 9.1 第一阶段（当前任务）

1. ✅ 建立 `assets/` 目录结构。
2. ✅ 创建 `assets/manifest/asset-schema.json`（JSON Schema 定义）。
3. ✅ 基于 `docs/ASSET_INVENTORY.md` 生成初始 `assets/manifest/asset-manifest.json`。
4. ✅ 实现基础 `AssetManager` 类，包含 `getUrl()`、`getAsset()`、`preloadAsset()` 方法。
5. ✅ 实现 `BrowserAssetAdapter`。
6. ✅ 将关键资源迁移至新结构（见 Phase 4：Migration）。

### 9.2 第二阶段

1. 实现 `MobileAssetAdapter`（移动端资源变体加载）。
2. 实现 `EmbeddedGameAdapter`（AAA 游戏内嵌接口）。
3. 完善缓存与释放策略（Three.js 模型生命周期管理）。
4. 添加资源完整性校验（Hash 检查）。

### 9.3 第三阶段

1. 自动化资产检查工具（见 Phase 5）。
2. 完整的资源替换指南文档。
3. 跨平台测试套件。

---

## 10. 附录

### 10.1 资产 ID 命名速查表

| 资源类型 | 推荐 Asset ID | 说明 |
|---|---|---|
| 东海道棋盘背景 | `board.tokaido.background` | `images/boards/tokaido/background.webp` |
| 妖怪棋盘背景 | `board.yokai.background` | `images/boards/yokai/background.webp` |
| 源氏棋盘背景 | `board.genji.background` | `images/boards/genji/background.webp` |
| 武将决集棋盘背景 | `board.kesshu.background` | `images/boards/kesshu/background.webp` |
| 棋子 (Kokeshi) | `piece.kokeshi` | `models/characters/kokeshi/` |
| 骨骰 | `model.dice.bone` | `models/props/dice/bone.glb` |
| 骰子滚动音效 | `audio.sfx.dice-roll` | `audio/sfx/dice-roll.ogg` |
| 三味线 BGM (Tokaido) | `audio.bgm.tokaido` | `audio/bgm/tokaido/ shamisen-koto.mp3` |
| UI 图标 (骰子) | `ui.icon.dice` | `ui/dice-icon.svg` |
| 字体 (Shippori Mincho) | `font.shippori-mincho` | `fonts/shipporiminchob1_001.woff2` |

### 10.2 JSON Schema (asset-schema.json) 示例

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Esugoroku Asset Manifest Schema",
  "type": "object",
  "required": ["schemaVersion", "generatedAt", "source", "assets", "groups"],
  "properties": {
    "schemaVersion": { "type": "integer", "minimum": 1, "maximum": 99 },
    "generatedAt": { "type": "string", "format": "date-time" },
    "source": { "type": "string", "description": "Source of the audit (e.g., docs/ASSET_INVENTORY.md)" },
    "assets": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["id", "type", "path", "group", "platforms"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z]+\\.[a-z]+\\.[a-z0-9-]+$" },
          "type": { 
            "type": "string", 
            "enum": ["image", "audio", "model", "font", "effect", "programmatic"] 
          },
          "path": { "type": "string", "format": "uri-reference" },
          "group": { "type": "string" },
          "platforms": {
            "type": "array",
            "items": { "type": "string", "enum": ["web", "mobile", "embedded"] },
            "default": ["web"]
          },
          "variants": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "suffix": { "type": "string" },
                "platform": { "type": "string", "enum": ["web", "mobile", "embedded"] }
              },
              "required": ["suffix", "platform"]
            }
          },
          "metadata": {
            "type": "object",
            "properties": {
              "description": { "type": "string" },
              "historicalStatus": {
                "type": "string",
                "enum": ["original-source", "historical-reconstruction", "historical-adaptation", "ai-generated", "original-artwork", "placeholder"]
              },
              "license": { "type": "string" },
              "attribution": { "type": "string" },
              "source": { "type": "string" },
              "sourceUrl": { "type": "string", "format": "uri" },
              "catalogId": { "type": "string" },
              "author": { "type": "string" },
              "tags": {
                "type": "array",
                "items": { "type": "string" }
              }
            },
            "additionalProperties": false
          },
          "hash": { "type": "string", "format": "sha256" },
          "fallback": {
            "type": "object",
            "properties": {
              "type": { "type": "string" },
              "path": { "type": "string" }
            }
          },
          "loadStrategy": {
            "type": "string",
            "enum": ["eager", "lazy", "deferred"],
            "default": "lazy"
          },
          "version": { "type": "string" }
        }
      }
    },
    "groups": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "description": { "type": "string" },
          "assets": {
            "type": "array",
            "items": { "type": "string" }
          },
          "preload": { "type": "boolean" },
          "platforms": {
            "type": "array",
            "items": { "type": "string", "enum": ["web", "mobile", "embedded"] }
          }
        },
        "required": ["description", "assets"]
      }
    }
  },
  "additionalProperties": false
}