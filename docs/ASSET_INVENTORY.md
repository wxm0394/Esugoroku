# Esugoroku (絵双六) — 全项目美术与音响资产审计盘点表 (Asset Inventory)

本文档是 Esugoroku V2.1 模块化资产系统构建（Phase 1）的全面资产盘点记录。全量盘点覆盖了项目代码、静态目录及前端资源中的所有图像、音频、三维、字体及程序化生成资产。

---

## 1. 资产盘点概览

| 资源大类 | 包含子类型 | 文件/资源数量 | 存储位置与引用来源 | 总存储体积/特征 |
|---|---|---|---|---|
| **浮世绘大版面 master sheets** | JPG | 9 张 (另有1张保留版) | `public/assets/aistudio/` | ~1.68 MB |
| **浮世绘切片卡牌 prints** | WebP | 69 张 | `mobile/assets/prints/` | ~1.34 MB |
| **矢量 UI 与应用图标** | SVG | 1 个 (`icon.svg`) | `mobile/assets/` | ~1.2 KB |
| **日系古风分体字体** | WOFF2 | 367 个分片文件 | `mobile/assets/fonts/` | ~12.8 MB |
| **程序化音效与 BGM** | WebAudio 节点 | 11 种 SFX + 4 套三味线/箏曲 BGM | `mobile/js/audio.js`, `v3_theater_overhaul.js` | 纯代码合成，0 B 文件大小 |
| **程序化 3D 纹理与几何体** | Canvas 动态生成 | 4 套棋盘纹理 + 4 款芥子（Kokeshi）木驹 + 骨骰 | `mobile/js/tabletop_3d.js` | 代码生成 WebGL 纹理与 BufferGeometry |

---

## 2. 详细资产清单

### 2.1 浮世绘大版面 Master Sheets (Master Prints)

| Asset ID | 当前文件或代码位置 | 资源类型 | 使用位置 | 当前引用方式 | 文件大小 | 是否重复 | 可替换性 | 版权状态 | 处理建议 |
|---|---|---|---|---|---|---|---|---|---|
| `board.tokaido.mastersheet.jinja` | `public/assets/aistudio/v2-de9b2227c1ae60d2ad93091f2c368ba2_r_33d70672.jpg` | image | `nishikie_woodblock.js`, `index.html` | JS `MASTER_SHEETS`, HTML `<img>` | ~179 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/tokaido/` |
| `board.tokaido.mastersheet.map` | `public/assets/aistudio/v2-0287deb0080d07adcf42166238672c64_r_b2a0b162.jpg` | image | `nishikie_woodblock.js` | JS `MASTER_SHEETS` | ~166 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/tokaido/` |
| `board.tokaido.mastersheet.meibutsu` | `public/assets/aistudio/v2-a25c0e4de38fc6975ace74efb5fd39cc_r_b65cdc4b.jpg` | image | `nishikie_woodblock.js` | JS `MASTER_SHEETS` | ~193 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/tokaido/` |
| `board.yokai.mastersheet.collage` | `public/assets/aistudio/v2-be2eef69ff02fff49f3a362045aa1bb0_r_5a6413a7.jpg` | image | `nishikie_woodblock.js`, `index.html` | JS `MASTER_SHEETS`, HTML `<img>` | ~163 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/yokai/` |
| `board.yokai.mastersheet.kabuki` | `public/assets/aistudio/v2-ec2e63aab108e2656b088d7dfba6b0ce_r_f3890e4f.jpg` | image | `nishikie_woodblock.js` | JS `MASTER_SHEETS` | ~135 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/yokai/` |
| `board.kesshu.mastersheet.tilted` | `public/assets/aistudio/v2-66c8cbba45a5e5db3bbeae4d884a556c_r_a1e662dd.jpg` | image | `nishikie_woodblock.js`, `index.html` | JS `MASTER_SHEETS`, HTML `<img>` | ~186 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/kesshu/` |
| `board.kesshu.mastersheet.portraits` | `public/assets/aistudio/v2-c6536ca0828d251624fa2494fdc2d7e8_r_cf951d0e.jpg` | image | `nishikie_woodblock.js` | JS `MASTER_SHEETS` | ~152 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/kesshu/` |
| `board.genji.mastersheet.strips` | `public/assets/aistudio/v2-2ea7f57afdf0bf62b4d0d8854269efe9_r_cfd81106.jpg` | image | `nishikie_woodblock.js`, `index.html` | JS `MASTER_SHEETS`, HTML `<img>` | ~139 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/genji/` |
| `board.genji.mastersheet.palace` | `public/assets/aistudio/v2-fd75dd6025dfca9de24f93b336657329_r_2483b494.jpg` | image | `nishikie_woodblock.js` | JS `MASTER_SHEETS` | ~150 KB | 否 | 高 | UNVERIFIED | 规范迁移至 `assets/images/boards/genji/` |
| `board.unused.mastersheet.v2_7e` | `public/assets/aistudio/v2-7e25957d4427bd60b3a947aeb344243b_r_5282e5a9.jpg` | image | 未在代码中引用 | 无引用 | ~163 KB | 否 | 高 | UNVERIFIED | 暂保留并记录（待归档资产） |

---

### 2.2 锦绘卡牌切片 (Prints Artwork)

共计 69 张 WebP 切片插效图，包含 17 张东海道宿场图、10 张妖怪图、16 张武将决集图、23 张源氏物语绘合图、3 张怀中守札（护符）图。

| Asset ID 规范 | 路径位置 | 资源类型 | 使用模块 | 原引用键值 | 替换建议 |
|---|---|---|---|---|---|
| `print.tokaido.nihonbashi` .. `kyoto` (17项) | `mobile/assets/prints/tokaido_*.webp` | image/webp | `prints_assets.js` | `PRINT_ASSETS.tokaido.*` | 迁移至 `assets/images/prints/tokaido/` |
| `print.yokai.kappa` .. `hyakumonogatari` (10项) | `mobile/assets/prints/yokai_*.webp` | image/webp | `prints_assets.js` | `PRINT_ASSETS.yokai.*` | 迁移至 `assets/images/prints/yokai/` |
| `print.kesshu.shootsujin` .. `agari` (16项) | `mobile/assets/prints/kesshu_*.webp` | image/webp | `prints_assets.js` | `PRINT_ASSETS.kesshu.*` | 迁移至 `assets/images/prints/kesshu/` |
| `print.genji.kiritsubo` .. `genji` (23项) | `mobile/assets/prints/genji_*.webp` | image/webp | `prints_assets.js` | `PRINT_ASSETS.genji.*` | 迁移至 `assets/images/prints/genji/` |
| `print.charm.stay`, `guard`, `dash` (3项) | `mobile/assets/prints/charm_*.webp` | image/webp | `prints_assets.js` | `PRINT_ASSETS.charms.*` | 迁移至 `assets/images/prints/charms/` |

---

### 2.3 字体与矢量 UI 资源 (Fonts & Icons)

| Asset ID | 当前位置 | 资源类型 | 使用位置 | 引用方式 | 状态 |
|---|---|---|---|---|---|
| `ui.icon.app` | `mobile/assets/icon.svg` | image/svg+xml | `index.html` | `<link rel="icon">` | 保留并统一登记 |
| `font.shippori_mincho` | `mobile/assets/fonts/shipporiminchob1_*.woff2` (367个) | font/woff2 | `mobile/fonts.css` | CSS `@font-face` | 保留并统一登记 |

---

### 2.4 程序化音效与 BGM 资产 (WebAudio Programmatic Assets)

项目不依赖外部音效文件（`.mp3`/`.wav`/`.ogg`），而是采用高质量 WebAudio 代码合成音效与和乐 BGM：

| Asset ID | 合成实现位置 | 音频类型 | 用途与特征 | 策略 |
|---|---|---|---|---|
| `audio.sfx.wood_clack` | `mobile/js/audio.js` (`tileWoodClack`) | sfx | 骰子撞击与棋子叩盘声（桧木振动） | 封装接口，提供 Asset ID |
| `audio.sfx.dice_roll` | `mobile/js/audio.js` & `v3_theater_overhaul.js` | sfx | 骨骰在瓷碗内滚动声 | 封装接口，提供 Asset ID |
| `audio.sfx.hyoshigi` | `mobile/js/v3_theater_overhaul.js` | sfx | 歌舞伎拍子木敲击声 | 封装接口，提供 Asset ID |
| `audio.sfx.koma_step` | `mobile/js/v3_theater_overhaul.js` | sfx | 将棋木驹落盘声 | 封装接口，提供 Asset ID |
| `audio.bgm.tokaido` | `mobile/js/audio.js` | bgm | 三味线·箏曲《东海道》 | 封装接口，提供 Asset ID |
| `audio.bgm.yokai` | `mobile/js/audio.js` | bgm | 三味线·箏曲《百物語》 | 封装接口，提供 Asset ID |
| `audio.bgm.kesshu` | `mobile/js/audio.js` | bgm | 三味线·箏曲《武将決集》 | 封装接口，提供 Asset ID |
| `audio.bgm.genji` | `mobile/js/audio.js` | bgm | 三味线·箏曲《源氏物語》 | 封装接口，提供 Asset ID |

---

### 2.5 程序化 3D 几何体与纹理 (Three.js Procedural Models & Textures)

| Asset ID | 逻辑实现位置 | 资源类型 | 用途 |
|---|---|---|---|
| `model.koma.kokeshi` | `mobile/js/tabletop_3d.js` | procedural/geometry | 3D 芥子（Kokeshi）木驹几何体 |
| `model.dice.bone` | `mobile/js/tabletop_3d.js` | procedural/geometry | 3D 六面骨骰几何体及 1..6 点面方位 |
| `texture.board.washi` | `mobile/js/tabletop_3d.js` | procedural/texture | 动态和纸纸纹与马连波纹 Bump Map |
