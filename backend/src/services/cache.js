/**
 * 缓存服务 - 简化版内存缓存实现
 * 用于缓存delegation状态，减少RPC调用
 */
import { config } from '../config.js';

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = config.cacheTtlSeconds * 1000; // 转换为毫秒
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {*} 缓存值，如果不存在或已过期返回null
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} [ttl] - 过期时间（毫秒），可选，默认使用配置的TTL
   */
  set(key, value, ttl = this.ttl) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  /**
   * 删除缓存值
   * @param {string} key - 缓存键
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
  }
}

export const cache = new MemoryCache();
