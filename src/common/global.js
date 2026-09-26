// 全局工具和常量，减少重复导入和内存占用

// 将通用方法挂载到global对象上，减少模块导入
if (typeof global !== 'undefined') {
  // 定时器管理器，用于清理所有定时器
  global.timerManager = {
    timers: new Set(),
    
    setTimeout: function(callback, delay) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        callback();
      }, delay);
      this.timers.add(timer);
      return timer;
    },
    
    clearTimeout: function(timer) {
      clearTimeout(timer);
      this.timers.delete(timer);
    },
    
    clearAllTimers: function() {
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();
    }
  };
  
  // 常用工具函数
  global.utils = {
    // 防抖函数 - 使用定时器管理器
    debounce: function(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          global.timerManager.clearTimeout(timeout);
          func.apply(this, args);
        };
        global.timerManager.clearTimeout(timeout);
        timeout = global.timerManager.setTimeout(later, wait);
      };
    },
    
    // 节流函数 - 使用定时器管理器
    throttle: function(func, limit) {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          global.timerManager.setTimeout(() => inThrottle = false, limit);
        }
      };
    },
    
    // 安全的JSON解析
    safeJSONParse: function(str, defaultValue = null) {
      try {
        return JSON.parse(str);
      } catch (e) {
        return defaultValue;
      }
    },
    
    // 内存安全的字符串操作
    safeSubstring: function(str, start, length) {
      if (!str) return '';
      return str.substring(start, start + length);
    },
    
    // 安全的文件读取和内存释放
    safeFileRead: async function(readFunction) {
      let result = null;
      try {
        result = await readFunction();
        return result;
      } catch (e) {
        console.error('文件读取错误:', e);
        return null;
      } finally {
        // 确保及时释放内存
        if (typeof global !== 'undefined' && global.runGC) {
          setTimeout(() => global.runGC(), 100);
        }
      }
    },
    
    // 批量内存释放
    releaseMemory: function() {
      // 释放可能的内存引用
      if (typeof global !== 'undefined') {
        // 调用垃圾回收
        if (global.runGC) {
          global.runGC();
        }
      }
    }
  };
  
  console.log('全局工具函数已挂载');
}

export {};