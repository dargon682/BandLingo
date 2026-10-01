// 全局工具和常量，减少重复导入和内存占用

// 将通用方法挂载到global对象上，减少模块导入
if (typeof global !== 'undefined') {
  // 定时器管理器，用于清理所有定时器（用数组替代 Set，兼容精简运行时）
  global.timerManager = {
    timers: [],
    
    setTimeout: function(callback, delay) {
      const timer = setTimeout(() => {
        const i = this.timers.indexOf(timer);
        if (i > -1) this.timers.splice(i, 1);
        callback();
      }, delay);
      this.timers.push(timer);
      return timer;
    },
    
    clearTimeout: function(timer) {
      clearTimeout(timer);
      const i = this.timers.indexOf(timer);
      if (i > -1) this.timers.splice(i, 1);
    },
    
    clearAllTimers: function() {
      for (let i = 0; i < this.timers.length; i++) {
        clearTimeout(this.timers[i]);
      }
      this.timers = [];
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
    
    // 安全的文件读取和内存释放（说明：不再提供 safeFileRead——该实现使用 async/await 语法，
    // 低内存/精简设备（如小米手环10）的 JS 引擎不支持 async，模块加载即语法崩溃，故移除。
    // 需要异步读文件的调用方直接使用回调风格即可）
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