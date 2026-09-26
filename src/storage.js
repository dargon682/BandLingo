/**
 * 简化的存储管理器
 * 使用内存缓存 + 文件持久化的双重保障
 */
import file from '@system.file'

class StorageManager {
  constructor() {
    this.cache = {};
    this.filePath = 'internal://files/storage-config.json';
    this.initialized = false;
  }

  // 初始化存储
  async init() {
    if (this.initialized) return;
    
    try {
      const data = await this.readFile();
      this.cache = data || {};
      this.initialized = true;
      console.log('StorageManager初始化成功:', Object.keys(this.cache));
    } catch (error) {
      console.log('StorageManager初始化失败，使用空缓存:', error);
      this.cache = {};
      this.initialized = true;
    }
  }

  // 读取文件
  readFile() {
    return new Promise((resolve, reject) => {
      file.readText({
        uri: this.filePath,
        success: (data) => {
          try {
            resolve(JSON.parse(data.text));
          } catch (e) {
            resolve({});
          }
        },
        fail: () => {
          resolve({});
        }
      });
    });
  }

  // 写入文件
  writeFile(data) {
    return new Promise((resolve, reject) => {
      file.writeText({
        uri: this.filePath,
        text: JSON.stringify(data, null, 2),
        success: () => {
          console.log('StorageManager: 文件写入成功');
          resolve();
        },
        fail: (error, code) => {
          console.log('StorageManager: 文件写入失败', code);
          reject(error);
        }
      });
    });
  }

  // 获取值
  async get(key, defaultValue = '') {
    await this.init();
    const value = this.cache[key];
    console.log(`StorageManager.get: ${key} = ${value || defaultValue}`);
    return value || defaultValue;
  }

  // 设置值
  async set(key, value) {
    await this.init();
    this.cache[key] = value;
    console.log(`StorageManager.set: ${key} = ${value}`);
    
    try {
      await this.writeFile(this.cache);
      console.log(`StorageManager: ${key} 保存成功`);
      return true;
    } catch (error) {
      console.log(`StorageManager: ${key} 保存失败`, error);
      return false;
    }
  }

  // 删除键
  async delete(key) {
    await this.init();
    delete this.cache[key];
    console.log(`StorageManager.delete: ${key}`);
    
    try {
      await this.writeFile(this.cache);
      return true;
    } catch (error) {
      console.log(`StorageManager: ${key} 删除失败`, error);
      return false;
    }
  }

  // 清空所有数据
  async clear() {
    await this.init();
    this.cache = {};
    
    try {
      await this.writeFile(this.cache);
      console.log('StorageManager: 清空成功');
      return true;
    } catch (error) {
      console.log('StorageManager: 清空失败', error);
      return false;
    }
  }
}

// 创建单例实例
const storageManager = new StorageManager();

// 导出兼容旧API的接口
const storageFile = {
  get: async (param) => {
    try {
      const value = await storageManager.get(param.key, param.default);
      if (param.success) param.success(value);
      if (param.complete) param.complete();
    } catch (error) {
      console.log('storage.get失败:', error);
      if (param.fail) param.fail(error);
      if (param.complete) param.complete();
    }
  },
  
  set: async (param) => {
    try {
      const success = await storageManager.set(param.key, param.value);
      if (success) {
        if (param.success) param.success();
      } else {
        if (param.fail) param.fail();
      }
      if (param.complete) param.complete();
    } catch (error) {
      console.log('storage.set失败:', error);
      if (param.fail) param.fail(error);
      if (param.complete) param.complete();
    }
  },
  
  delete: async (param) => {
    try {
      const success = await storageManager.delete(param.key);
      if (success) {
        if (param.success) param.success();
      } else {
        if (param.fail) param.fail();
      }
      if (param.complete) param.complete();
    } catch (error) {
      console.log('storage.delete失败:', error);
      if (param.fail) param.fail(error);
      if (param.complete) param.complete();
    }
  },
  
  clear: async (param) => {
    try {
      const success = await storageManager.clear();
      if (success) {
        if (param.success) param.success();
      } else {
        if (param.fail) param.fail();
      }
      if (param.complete) param.complete();
    } catch (error) {
      console.log('storage.clear失败:', error);
      if (param.fail) param.fail(error);
      if (param.complete) param.complete();
    }
  }
};

export default storageFile;