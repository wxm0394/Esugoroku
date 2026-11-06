// Esugoroku V2.1 Modular Asset System
// AssetRegistry — 读取、校验及查询 Manifest
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

import manifestData from './asset-manifest.json' with { type: 'json' };

export class AssetRegistryImpl {
  constructor(data) {
    this.manifest = data || manifestData;
    this.assetsMap = new Map();
    this.groupsMap = new Map();
    this.init();
  }

  init() {
    if (!this.manifest || !this.manifest.assets) {
      console.error('AssetRegistry: Invalid manifest data.');
      return;
    }

    // 填充 assetsMap
    for (const [id, asset] of Object.entries(this.manifest.assets)) {
      this.assetsMap.set(id, { id, ...asset });
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
    // 优先匹配显式定义的 group
    if (this.groupsMap.has(groupNameOrPrefix)) {
      return this.groupsMap.get(groupNameOrPrefix).assets || [];
    }

    // 前缀匹配 (例如 "board.tokaido" 匹配 "board.tokaido.background", "board.tokaido.node-art")
    const matched = [];
    for (const [id, asset] of this.assetsMap.entries()) {
      if (asset.group === groupNameOrPrefix || id.startsWith(groupNameOrPrefix + '.')) {
        matched.push(id);
      }
    }
    return matched;
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
}

// 实例导出
export const AssetRegistry = new AssetRegistryImpl(manifestData);