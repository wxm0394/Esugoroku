// Esugoroku V2.1 Modular Asset System
// BrowserAssetAdapter — 浏览器环境资产适配器
// 遵循 ASSET_SYSTEM_DESIGN.md 规范

export class BrowserAssetAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
  }

  /**
   * 将相对路径转换为浏览器可加载的 URL
   * @param {string} relativePath - 相对路径
   * @param {object} asset - 资产条目
   * @param {string} platform - 当前平台 ('web', 'mobile', etc.)
   * @returns {string} 绝对或相对 URL
   */
  toLoadUrl(relativePath, asset, platform) {
    if (!relativePath) return '';
    // 如果已经是 data: URI 或绝对 URL (http://, https://)
    if (relativePath.startsWith('data:') || relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }

    // 结合 baseUrl
    let url = relativePath;
    if (this.baseUrl && !url.startsWith('/')) {
      url = `${this.baseUrl}/${url}`.replace(/\/+/g, '/');
    }

    return url;
  }

  /**
   * 浏览器图片加载方法
   * @param {string} url - 图片 URL
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // 避免 canvas 污染
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error(`Failed to load image from "${url}": ${err.message || 'Network error'}`));
      img.src = url;
    });
  }

  /**
   * 浏览器音频加载方法 (WebAudio)
   * @param {string} url - 音频 URL
   * @returns {Promise<AudioBuffer>}
   */
  async loadAudio(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} while fetching audio from "${url}"`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return await audioCtx.decodeAudioData(arrayBuffer);
  }

  /**
   * 检查资源 URL 是否在网络中可用 (HEAD 请求)
   * @param {string} url - 资源 URL
   * @returns {Promise<boolean>}
   */
  async exists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}