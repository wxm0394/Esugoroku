// Esugoroku V2.1 Modular Asset System
// AssetRegistry — 读取、校验及查询 Manifest
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

import manifestData from './asset-manifest.json' with { type: 'json' };

export class AssetRegistryImpl {
  constructor(data) {
    this.assetsMap = new Map();
    this.groupsMap = new Map();
    this.programmaticRegistry = new Map(); // Programmatic Factory Registry
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

    if (!this.manifest || !this.manifest.assets) {
      console.error('AssetRegistry: Invalid manifest data.');
      return;
    }

    // 填充 assetsMap
    for (const [id, asset] of Object.entries(this.manifest.assets)) {
      this.assetsMap.set(id, { id, ...asset });
      // Register programmatic assets in the factory registry
      if (asset.type === 'programmatic' && asset.sourceType) {
        this.programmaticRegistry.set(id, {
          type: asset.sourceType,
          path: asset.path,
          factory: this._createProgrammaticAsset.bind(this, id)
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
      if (!asset.path) {
        errors.push(`Asset "${id}" missing required field "path".`);
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
   * Programmatic Factory Registry: Create/load a programmatic asset instance
   * @param {string} id - Asset ID
   * @returns {Promise<object>} - Asset instance (HTMLImageElement, AudioBuffer, etc.)
   */
  async createProgrammaticAsset(id) {
    const registryEntry = this.programmaticRegistry.get(id);
    if (!registryEntry) {
      throw new Error(`Asset "${id}" is not a programmatic asset or not registered in factory registry.`);
    }

    // Different factory methods based on sourceType
    switch (registryEntry.type) {
      case 'factory':
        return registryEntry.factory();
      case 'procedural':
        return registryEntry.factory();
      default:
        throw new Error(`Unknown programmatic source type: ${registryEntry.type}`);
    }
  }

  /**
   * Internal factory method for kokeshi pawn model
   * @param {string} id
   * @returns {Promise<object>}
   */
  async _createProgrammaticAsset(id) {
    const assetDef = this.assetsMap.get(id);
    if (!assetDef) {
      throw new Error(`Asset "${id}" not found in manifest.`);
    }

    // Return a placeholder/proxy for the programmatic asset
    // In a real implementation, this would create Three.js models, WebAudio buffers, etc.
    return {
      id,
      type: assetDef.type,
      isProgrammatic: true,
      path: assetDef.path,
      metadata: assetDef.metadata,
      // Placeholder - actual creation would happen in the renderer/audio system
      instance: null,
      load: async () => {
        // Simulate async loading
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      }
    };
  }
}

// 实例导出
export const AssetRegistry = new AssetRegistryImpl(manifestData);