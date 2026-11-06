// Esugoroku V2.1 Modular Asset System
// AssetManager — 统一资源访问、加载、缓存与释放模块
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

import { AssetRegistry } from './manifest/asset-registry.js';

/**
 * AssetManager 类
 * 提供获取资源 URL、预加载、播放音效、释放资源等核心功能。
 */
export class AssetManager {
  constructor(registryOrAdapter = null, adapter = null) {
    // 支持两种初始化方式：new AssetManager(registry) 或 new AssetManager(adapter)
    if (registryOrAdapter && registryOrAdapter.getAsset) {
      this.registry = registryOrAdapter;
      this.adapter = adapter || (typeof window !== "undefined" ? new BrowserAssetAdapter() : null);
    } else {
      this.registry = AssetRegistry;
      this.adapter = registryOrAdapter || (typeof window !== "undefined" ? new BrowserAssetAdapter() : null);
    }
    this.urlCache = new Map();    // Asset ID -> URL 字符串缓存
    this.assetCache = new Map();  // Asset ID -> 资源对象缓存
    this.loadedImages = new Map(); // Image 元素缓存
    this.loadedAudio = new Map();  // AudioBuffer 或 HTMLAudioElement 缓存
    this.pendingLoads = new Map(); // 正在加载中的 Promise 缓存 (de-duplication)
    this.loadStrategy = 'lazy';   // 默认懒加载
    this.currentPlatform = this.detectPlatform();
  }

  /**
   * 检测当前运行平台
   */
  detectPlatform() {
    if (typeof window === 'undefined') return 'embedded';
    if (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) return 'mobile';
    return 'web';
  }

  /**
   * 设置自定义适配器
   * @param {object} adapter - 适配器对象，须实现 toLoadUrl, loadImage, loadAudio, exists 方法
   */
  setAdapter(adapter) {
    this.adapter = adapter;
  }

  /**
   * 获取通过 Asset ID 对应的资源 URL
   * @param {string} id - Asset ID (如 "board.tokaido.background")
   * @returns {string} 资源 URL
   */
  getUrl(id) {
    // 先检查缓存
    if (this.urlCache.has(id)) {
      return this.urlCache.get(id);
    }

    // 从清单中查找资产
    const asset = this.registry.getAsset(id);
    if (!asset) {
      console.warn(`AssetManager: Asset "${id}" not found in manifest. Returning null.`);
      return null;
    }

    // 根据平台选择变体（如果有适配器则使用适配器，否则直接使用路径）
    let path = asset.path;

    if (this.adapter && this.adapter.toLoadUrl) {
      path = this.adapter.toLoadUrl(path, asset, this.currentPlatform);
    } else if (asset.variants && asset.variants.length > 0) {
      // 简单的变体选择：根据平台前缀匹配
      const platformVariants = asset.variants.filter(v => v.platform === this.currentPlatform);
      if (platformVariants.length > 0) {
        const variant = platformVariants[0];
        if (variant.suffix) {
          const base = path.replace(/\.[^./]+$/, '');
          const ext = path.slice(path.lastIndexOf('.'));
          path = `${base}${variant.suffix}${ext}`;
        }
      }
    }

    // 缓存并返回
    this.urlCache.set(id, path);
    return path;
  }

  /**
   * 获取完整的资产条目对象
   * @param {string} id - Asset ID
   * @returns {object|null} 资产条目或 null
   */
  getAsset(id) {
    return this.registry.getAsset(id) || null;
  }

  /**
   * 预加载单个资源
   * @param {string} id - Asset ID
   * @returns {Promise<void>}
   */
  async preloadAsset(id) {
    // De-duplication: if already loaded or already loading, return cached/promise
    if (this.loadedImages.has(id) || this.loadedAudio.has(id)) return;
    if (this.pendingLoads.has(id)) return await this.pendingLoads.get(id);

    const asset = this.getAsset(id);
    if (!asset) {
      console.warn(`AssetManager: Cannot preload "${id}" — not found in manifest.`);
      return;
    }

    const url = this.getUrl(id);
    const type = asset.type;

    // Mark this load as pending before starting
    const loadPromise = new Promise(async (resolve, reject) => {
      try {
        switch (type) {
          case 'image': {
            const img = this.loadedImages.get(id);
            if (img) {
              resolve(img);
              return;
            }

            const image = new Image();
            image.onload = () => {
              this.loadedImages.set(id, image);
              resolve(image);
            };
            image.onerror = (err) => {
              console.error(`AssetManager: Failed to load image "${id}"`, err);
              // 尝试回退到默认占位图
              const fallbackUrl = this.getFallbackUrl(id, 'image');
              image.src = fallbackUrl;
              resolve(image);
            };
            image.src = url;
            await image.decode ? image.decode() : Promise.resolve();
            resolve(image);
            break;
          }

          case 'audio': {
            const audio = this.loadedAudio.get(id);
            if (audio) {
              resolve(audio);
              return;
            }

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = await audioCtx.decodeAudioData(arrayBuffer);
            this.loadedAudio.set(id, { context: audioCtx, buffer });
            resolve({ context: audioCtx, buffer });
            break;
          }

          default:
            console.warn(`AssetManager: Preload type "${type}" not fully supported yet.`);
            resolve(null);
        }
      } catch (err) {
        console.error(`AssetManager: Failed to preload "${id}"`, err);
        resolve(null);
      } finally {
        // Remove from pending loads after completion
        this.pendingLoads.delete(id);
      }
    });

    this.pendingLoads.set(id, loadPromise);
    await loadPromise;
  }

  /**
   * 预加载资源组（同一分组的所有资源）
   * @param {string} groupPrefix - 组前缀 (如 "board.tokaido")
   * @returns {Promise<void>}
   */
  async preloadGroup(groupPrefix) {
    const assetIds = this.registry.getAssetsByGroup(groupPrefix);
    if (!assetIds || assetIds.length === 0) {
      console.warn(`AssetManager: No assets found for group "${groupPrefix}".`);
      return;
    }

    // 并行预加载所有资源
    await Promise.all(assetIds.map(id => this.preloadAsset(id)));
  }

  /**
   * 播放音效
   * @param {string} id - Asset ID (如 "audio.sfx.dice-roll")
   * @param {object} [options] - 可选参数 { volume, loop }
   * @returns {Promise<void>}
   */
  async playSound(id, options = {}) {
    const asset = this.getAsset(id);
    if (!asset || asset.type !== 'audio') {
      console.warn(`AssetManager: "${id}" is not an audio asset.`);
      return;
    }

    const audioInfo = this.loadedAudio.get(id);
    if (!audioInfo || !audioInfo.buffer) {
      await this.preloadAsset(id);
      const newAudioInfo = this.loadedAudio.get(id);
      if (!newAudioInfo || !newAudioInfo.buffer) {
        console.error(`AssetManager: Audio "${id}" not available after preload.`);
        return;
      }
    }

    const ctx = audioInfo.context;
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn(`AssetManager: Could not resume AudioContext for "${id}":`, err);
      }
    }
    const gainNode = ctx.createGain();
    gainNode.gain.value = options.volume !== undefined ? options.volume : 0.48;

    const source = ctx.createBufferSource();
    source.buffer = audioInfo.buffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);

    // 如果是循环
    if (options.loop) {
      source.loop = true;
    }
  }

  /**
   * 释放单个资源
   * @param {string} id - Asset ID
   */
  disposeAsset(id) {
    this.loadedImages.delete(id);
    this.loadedAudio.delete(id);
    this.urlCache.delete(id);
    this.assetCache.delete(id);
    console.log(`AssetManager: Disposed asset "${id}".`);
  }

  /**
   * 释放整个资源组
   * @param {string} groupPrefix - 组前缀
   */
  disposeGroup(groupPrefix) {
    const assetIds = this.registry.getAssetsByGroup(groupPrefix);
    if (!assetIds) return;

    assetIds.forEach(id => this.disposeAsset(id));
    console.log(`AssetManager: Disposed group "${groupPrefix}".`);
  }

  /**
   * 获取缺失资源的 fallback URL
   * @param {string} id - Asset ID
   * @param {string} type - 资源类型
   * @returns {string} fallback URL
   */
  getFallbackUrl(id, type) {
   const fallbacks = {
     image: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221%22%20height%3D%221%22%3E%3C%3C%3E%3E%3C%2Fsvg%3E',
     audio: 'data:audio/wav;base64,UklGRl9AAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRh',
     model: 'data:model/gltf+json;base64,',
     font: 'serif'
   };

   return (fallbacks[type] || fallbacks.image);
 }

  /**
   * 获取当前加载统计报告
   * @returns {object}
   */
  getStats() {
    return {
      cachedImages: this.loadedImages.size,
      cachedAudio: this.loadedAudio.size,
      cachedUrls: this.urlCache.size,
      loadStrategy: this.loadStrategy,
      currentPlatform: this.currentPlatform
    };
  }
}

// 导出默认单例（可选）
const defaultManager = new AssetManager();
export default defaultManager;

// 便捷接口导出（与设计文档保持一致）
export const {
  getUrl,
  getAsset,
  preloadAsset,
  preloadGroup,
  playSound,
  disposeAsset,
  disposeGroup,
  getStats
} = defaultManager;