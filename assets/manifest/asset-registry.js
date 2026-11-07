// Esugoroku V2.1 Modular Asset System
// AssetRegistry — 读取、校验及查询 Manifest
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

import manifestData from './asset-manifest.json' with { type: 'json' };

export class AssetRegistryImpl {
  constructor(data) {
    this.assetsMap = new Map();
    this.groupsMap = new Map();
    this.programmaticRegistry = new Map(); // Programmatic Factory Registry
    this.resolvers = new Map(); // Runtime resolver bindings
    this.init(data);
  }

  init(data = null) {
    if (data) {
      this.manifest = data;
    } else if (!this.manifest) {
      this.manifest = manifestData;
    }

    this.assetsMap.clear();
    this.groupsMap.clear();
    this.programmaticRegistry.clear();
    this.resolvers.clear();

    if (!this.manifest || !this.manifest.assets) {
      console.error('AssetRegistry: Invalid manifest data.');
      return;
    }

    // 填充 assetsMap
    for (const [id, asset] of Object.entries(this.manifest.assets)) {
      this.assetsMap.set(id, { id, ...asset });
      // Register programmatic assets in the factory registry
      if (asset.type === 'programmatic' && asset.implementationKey) {
        this.programmaticRegistry.set(id, {
          id,
          type: asset.sourceType || 'factory',
          implementationKey: asset.implementationKey,
          path: asset.path,
        });
      }
    }

    // 填充 groupsMap
    if (this.manifest.groups) {
      for (const [groupName, groupDef] of Object.entries(this.manifest.groups)) {
        this.groupsMap.set(groupName, groupDef);
      }
    }
  }

  /**
   * 根据 Asset ID 获取资产条目
   * @param {string} id - Asset ID
   * @returns {object|null}
   */
  getAsset(id) {
    return this.assetsMap.get(id) || null;
  }

  /**
   * 判断 Asset ID 是否已注册
   * @param {string} id - Asset ID
   * @returns {boolean}
   */
  hasAsset(id) {
    return this.assetsMap.has(id);
  }

  /**
   * 注册运行时解析器
   * @param {string} id - Asset ID 或 implementationKey
   * @param {Function} resolver - 返回资产实例的函数
   */
  registerProgrammaticAsset(id, resolver) {
    this.resolvers.set(id, resolver);
    if (!this.programmaticRegistry.has(id)) {
      this.programmaticRegistry.set(id, {
        id,
        type: 'factory',
        implementationKey: id,
      });
    }
  }

  /**
   * 获取指定分组下所有 Asset ID 数组
   * @param {string} groupNameOrPrefix - 分组名或前缀 (如 "board.tokaido")
   * @returns {string[]}
   */
  getAssetsByGroup(groupNameOrPrefix) {
    const matched = new Set();

    // 1) 显式 groupDef.assets 数组
    if (this.groupsMap.has(groupNameOrPrefix)) {
      const groupDef = this.groupsMap.get(groupNameOrPrefix);
      if (groupDef && Array.isArray(groupDef.assets)) {
        for (const id of groupDef.assets) {
          matched.add(id);
        }
      }
    }

    // 2) 匹配 asset.group 属性值
    for (const [id, asset] of this.assetsMap.entries()) {
      if (asset.group === groupNameOrPrefix) {
        matched.add(id);
      }
    }

    // 3) ID 前缀匹配 和 精确 ID 匹配
    for (const [id, asset] of this.assetsMap.entries()) {
      if (id === groupNameOrPrefix || id.startsWith(groupNameOrPrefix + '.')) {
        matched.add(id);
      }
    }

    return Array.from(matched);
  }

  /**
   * 获取所有注册的 Asset ID 列表
   * @returns {string[]}
   */
  getAllAssetIds() {
    return Array.from(this.assetsMap.keys());
  }

  /**
   * 校验 Manifest 数据结构有效性
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.manifest.schemaVersion) {
      errors.push('Missing schemaVersion in manifest root.');
    }

    if (!this.manifest.assets || typeof this.manifest.assets !== 'object') {
      errors.push('Missing or invalid "assets" object in manifest root.');
    }

    for (const [id, asset] of this.assetsMap.entries()) {
      if (!asset.type) {
        errors.push(`Asset "${id}" missing required field "type".`);
      }
      if (asset.type !== 'programmatic' && !asset.path) {
        errors.push(`Asset "${id}" missing required field "path".`);
      }
      if (asset.type === 'programmatic' && !asset.implementationKey) {
        errors.push(`Asset "${id}" missing required field "implementationKey".`);
      }
      if (!asset.group) {
        errors.push(`Asset "${id}" missing required field "group".`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Programmatic Factory Registry: Get programmatic asset definition
   * @param {string} id - Asset ID
   * @returns {object|null}
   */
  getProgrammaticAsset(id) {
    return this.programmaticRegistry.get(id) || null;
  }

  /**
   * Programmatic Factory Registry: Check if asset is programmatic
   * @param {string} id - Asset ID
   * @returns {boolean}
   */
  isProgrammatic(id) {
    const asset = this.assetsMap.get(id);
    return asset && asset.type === 'programmatic';
  }

  /**
   * Programmatic Factory Registry: Create/resolve a programmatic asset instance (AssetManager compatibility)
   * @param {string} id - Asset ID
   * @returns {Promise<object>} - Asset instance
   */
  async createProgrammaticAsset(id) {
    return this.resolveProgrammaticAsset(id);
  }

  /**
   * Programmatic Factory Registry: Resolve/create a programmatic asset instance
   * @param {string} id - Asset ID
   * @returns {Promise<object>} - Asset instance
   */
  async resolveProgrammaticAsset(id) {
    let registryEntry = this.programmaticRegistry.get(id);
    if (!registryEntry && this.assetsMap.has(id)) {
      const asset = this.assetsMap.get(id);
      if (asset.type === 'programmatic') {
        registryEntry = {
          id,
          type: asset.sourceType || 'factory',
          implementationKey: asset.implementationKey || id
        };
      }
    }

    if (!registryEntry && !this.resolvers.has(id)) {
      throw new Error(`Asset "${id}" is not a programmatic asset or not registered in factory registry.`);
    }

    // First check if a runtime resolver is registered
    const resolver = this.resolvers.get(id);
    if (resolver) {
      return resolver(registryEntry || { id });
    }

    // Default resolvers based on implementationKey
    const implementationKey = registryEntry.implementationKey;
    switch (implementationKey) {
      case 'piece.kokeshi':
      case 'createKokeshiPawn':
        return this._createKokeshiPawnResolver(registryEntry);
      case 'model.dice.bone':
      case 'createBoneDice':
        return this._createBoneDiceResolver(registryEntry);
      case 'audio.sfx.dice-roll':
      case 'audio.throwDie':
        return this._createDiceRollResolver(registryEntry);
      case 'audio.sfx.wood-clack':
      case 'audio.woodClack':
        return this._createWoodClackResolver(registryEntry);
      case 'audio.bgm.tokaido':
        return this._createBgmThemeResolver(registryEntry, 'tokaido');
      case 'audio.bgm.yokai':
        return this._createBgmThemeResolver(registryEntry, 'yokai');
      case 'audio.bgm.kesshu':
        return this._createBgmThemeResolver(registryEntry, 'kesshu');
      case 'audio.bgm.genji':
        return this._createBgmThemeResolver(registryEntry, 'genji');
      default:
        // Return a clean programmatic representation without fake paths
        return {
          id,
          type: registryEntry.type,
          isProgrammatic: true,
          implementationKey: registryEntry.implementationKey,
          instance: null,
          load: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return { success: true };
          }
        };
    }
  }

  /**
   * Default resolver for kokeshi pawn - returns pawn factory info
   * @param {object} registryEntry
   * @returns {object}
   */
  _createKokeshiPawnResolver(registryEntry) {
    return {
      id: registryEntry.id,
      type: registryEntry.type,
      isProgrammatic: true,
      implementationKey: registryEntry.implementationKey,
      kind: '3d-pawn',
      factoryInfo: {
        create: (side, primaryHex, accentHex, labelText) => {
          // In real Three.js environment, this would call createKokeshiPawn
          // For Node/mock, return structured pawn definition
          return {
            kind: 'kokeshi-pawn',
            side,
            primaryHex,
            accentHex,
            labelText,
            parts: 8,
            isThreeJSGroup: typeof THREE !== 'undefined'
          };
        }
      }
    };
  }

  /**
   * Default resolver for bone dice - returns dice factory info
   * @param {object} registryEntry
   * @returns {object}
   */
  _createBoneDiceResolver(registryEntry) {
    return {
      id: registryEntry.id,
      type: registryEntry.type,
      isProgrammatic: true,
      implementationKey: registryEntry.implementationKey,
      kind: '3d-dice',
      factoryInfo: {
        create: () => {
          // In real Three.js environment, this would create bone dice mesh + pips
          // For Node/mock, return structured dice definition
          return {
            kind: 'bone-dice',
            faces: 6,
            isThreeJSGroup: typeof THREE !== 'undefined'
          };
        }
      }
    };
  }

  /**
   * Default resolver for dice roll SFX - returns audio buffer info
   * @param {object} registryEntry
   * @returns {object}
   */
  _createDiceRollResolver(registryEntry) {
    return {
      id: registryEntry.id,
      type: registryEntry.type,
      isProgrammatic: true,
      implementationKey: registryEntry.implementationKey,
      kind: 'webaudio-sfx',
      factoryInfo: {
        play: () => {
          // In real WebAudio environment, this would call audio.throwDie()
          // For Node/mock, return structured SFX definition
          return {
            kind: 'dice-roll', type: 'webaudio-sfx', playable: true
          };
        }
      }
    };
  }

  /**
   * Default resolver for wood clack SFX - returns audio buffer info
   * @param {object} registryEntry
   * @returns {object}
   */
  _createWoodClackResolver(registryEntry) {
    return {
      id: registryEntry.id,
      type: registryEntry.type,
      isProgrammatic: true,
      implementationKey: registryEntry.implementationKey,
      kind: 'webaudio-sfx',
      factoryInfo: {
        play: () => {
          // In real WebAudio environment, this would call audio.woodClack()
          // For Node/mock, return structured SFX definition
          return {
            kind: 'wood-clack', type: 'webaudio-sfx', playable: true
          };
        }
      }
    };
  }

  /**
   * Default resolver for BGM theme - returns BGM theme definition
   * @param {object} registryEntry
   * @param {string} boardId
   * @returns {object}
   */
  _createBgmThemeResolver(registryEntry, boardId) {
    // Import BGM themes from audio.js
    const { BGM_THEMES, getBgmTheme } = globalThis.__esugorokuAudio || {};
    const theme = (BGM_THEMES && BGM_THEMES[boardId]) || (getBgmTheme && getBgmTheme(boardId)) || { id: boardId };
    return {
      id: registryEntry.id,
      type: registryEntry.type,
      isProgrammatic: true,
      implementationKey: registryEntry.implementationKey,
      kind: 'webaudio-bgm',
      factoryInfo: {
        theme,
        getTheme: () => theme,
        computeStepNotes: (stepIndex = 0) => {
          // In real environment, this would call computeBgmStepNotes
          return { themeId: boardId, step: stepIndex };
        }
      }
    };
  }
}

// 实例导出
export const AssetRegistry = new AssetRegistryImpl(manifestData);
