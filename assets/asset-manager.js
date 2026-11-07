// Esugoroku V2.1 Modular Asset System
// AssetManager — 统一资源访问、加载、缓存与释放模块
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

import { AssetRegistry } from './manifest/asset-registry.js';
import { BrowserAssetAdapter } from './adapters/browser-asset-adapter.js';

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
    this.sharedAudioCtx = null;   // 共享 AudioContext 实例
    this.loadStrategy = 'lazy';   // 默认懒加载
    this.currentPlatform = this.detectPlatform();
  }

  /**
   * 获取或创建共享 AudioContext
   */
  getAudioContext() {
    if (this.adapter && typeof this.adapter.getAudioContext === 'function') {
      return this.adapter.getAudioContext();
    }
    if (!this.sharedAudioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.sharedAudioCtx = new AudioCtx();
      }
    }
    return this.sharedAudioCtx;
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
    if (this.loadedImages.has(id)) return this.loadedImages.get(id);
    if (this.loadedAudio.has(id)) return this.loadedAudio.get(id);
    if (this.assetCache.has(id)) return this.assetCache.get(id);
    if (this.pendingLoads.has(id)) return await this.pendingLoads.get(id);

    const asset = this.getAsset(id);
    if (!asset) {
      console.warn(`AssetManager: Cannot preload "${id}" — not found in manifest.`);
      return null;
    }

    // Handle programmatic / factory assets
    const isProg = (this.registry && typeof this.registry.isProgrammatic === 'function') &&
                   (this.registry.isProgrammatic(id) || asset.sourceType === 'factory');
    if (isProg && typeof this.registry.createProgrammaticAsset === 'function') {
      const progPromise = (async () => {
        try {
          const progAsset = await this.registry.createProgrammaticAsset(id);
          if (progAsset) {
            this.assetCache.set(id, progAsset);
            return progAsset;
          }
          return null;
        } finally {
          this.pendingLoads.delete(id);
        }
      })();
      this.pendingLoads.set(id, progPromise);
      return await progPromise;
    }

    const loadPromise = (async () => {
      const url = this.getUrl(id);
      const type = asset.type;
      try {
        if (type === 'image') {
          if (this.adapter && typeof this.adapter.loadImage === 'function') {
            try {
              const img = await this.adapter.loadImage(url);
              this.loadedImages.set(id, img);
              return img;
            } catch (err) {
              console.error(`AssetManager: Adapter failed to load image "${id}"`, err);
              const fallbackUrl = this.getFallbackUrl(id, 'image');
              let fallbackImg = null;
              if (typeof Image !== 'undefined') {
                fallbackImg = new Image();
                fallbackImg.src = fallbackUrl;
              }
              this.loadedImages.set(id, fallbackImg);
              return fallbackImg;
            }
          }

          if (typeof Image === 'undefined') return null;

          return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
              this.loadedImages.set(id, image);
              resolve(image);
            };
            image.onerror = (err) => {
              console.error(`AssetManager: Failed to load image "${id}"`, err);
              const fallbackUrl = this.getFallbackUrl(id, 'image');
              image.src = fallbackUrl;
              this.loadedImages.set(id, image);
              resolve(image);
            };
            image.src = url;
          });
        } else if (type === 'audio') {
          if (this.adapter && typeof this.adapter.loadAudio === 'function') {
            try {
              const buffer = await this.adapter.loadAudio(url);
              const audioObj = { context: this.getAudioContext(), buffer };
              this.loadedAudio.set(id, audioObj);
              return audioObj;
            } catch (err) {
              console.error(`AssetManager: Adapter failed to load audio "${id}"`, err);
              return null;
            }
          }

          const audioCtx = this.getAudioContext() || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null);
          if (!audioCtx) return null;
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = await audioCtx.decodeAudioData(arrayBuffer);
          const audioObj = { context: audioCtx, buffer };
          this.loadedAudio.set(id, audioObj);
          return audioObj;
        } else {
          console.warn(`AssetManager: Preload type "${type}" not fully supported yet.`);
          return null;
        }
      } catch (err) {
        console.error(`AssetManager: Failed to preload "${id}"`, err);
        return null;
      } finally {
        this.pendingLoads.delete(id);
      }
    })();

    this.pendingLoads.set(id, loadPromise);
    return await loadPromise;
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

    let audioInfo = this.loadedAudio.get(id);
    if (!audioInfo || !audioInfo.buffer) {
      await this.preloadAsset(id);
      audioInfo = this.loadedAudio.get(id);
      if (!audioInfo || !audioInfo.buffer) {
        console.error(`AssetManager: Audio "${id}" not available after preload.`);
        return;
      }
    }

    const ctx = audioInfo.context || this.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn(`AssetManager: Could not resume AudioContext for "${id}":`, err);
      }
    }

    if (!ctx) return;

    const gainNode = ctx.createGain();
    gainNode.gain.value = options.volume !== undefined ? options.volume : 0.48;

    const source = ctx.createBufferSource();
    source.buffer = audioInfo.buffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);

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
      image: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221%22%20height%3D%221%22%3E%3C%2Fsvg%3E',
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
