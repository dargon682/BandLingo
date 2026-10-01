function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
// ===== console Polyfill（ES5，兼容精简运行时） =====
// 说明：低端穿戴设备（如小米手环10）的精简 JS 运行时可能没有 console 全局对象，
// 或缺少部分方法。若缺失，任何 console.* 调用都会在启动时抛 TypeError 导致崩溃/系统异常。
// 此处兜底：缺失时创建安全的空实现，避免启动链路（app.ux / global.js）直接崩溃。
(function () {
  var noop = function () {};
  var methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert', 'time', 'timeEnd', 'group', 'groupEnd', 'count', 'table', 'dir', 'dirxml', 'profile', 'profileEnd', 'exception'];
  var hasConsole = false;
  try {
    hasConsole = typeof console !== 'undefined';
  } catch (e) {
    hasConsole = false;
  }
  if (hasConsole) {
    try {
      for (var i = 0; i < methods.length; i++) {
        if (typeof console[methods[i]] !== 'function') console[methods[i]] = noop;
      }
      return;
    } catch (e) {}
  }
  // console 完全缺失：构建占位对象并挂载到全局
  var safe = {};
  for (var j = 0; j < methods.length; j++) safe[methods[j]] = noop;
  try {
    if (typeof global !== 'undefined') global.console = safe;
    if (typeof window !== 'undefined') window.console = safe;
    if (typeof globalThis !== 'undefined') globalThis.console = safe;
  } catch (e) {}
  try {
    console = safe;
  } catch (e) {}
})();
// 全局工具和常量，减少重复导入和内存占用
// ===== ES6+ API Polyfill（ES5 实现，兼容精简运行时） =====
// 说明：设备引擎可能缺失以下 ES2015+ 的 API，此处用 ES5 补齐，
// 避免任何页面在调用这些 API 时抛 TypeError 导致崩溃。
// 本模块在 app.ux 第一行 import，是启动链路最早执行的业务代码，
// 因此这里的 polyfill 会先于 rspack 运行时的 $translateStyle$ 生效。

if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = function (entries) {
    var obj = {};
    if (!entries) return obj;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e && _typeof(e) === 'object') obj[e[0]] = e[1];
    }
    return obj;
  };
}
if (typeof Object.assign !== 'function') {
  Object.assign = function (target) {
    if (!target) return target;
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  };
}
if (typeof Array.prototype.findIndex !== 'function') {
  Array.prototype.findIndex = function (fn, thisArg) {
    for (var i = 0; i < this.length; i++) {
      if (fn.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  };
}
if (typeof Array.prototype.find !== 'function') {
  Array.prototype.find = function (fn, thisArg) {
    for (var i = 0; i < this.length; i++) {
      if (fn.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  };
}
if (typeof Array.prototype.includes !== 'function') {
  Array.prototype.includes = function (value) {
    return this.indexOf(value) > -1;
  };
}
if (typeof String.prototype.includes !== 'function') {
  String.prototype.includes = function (str, pos) {
    return this.indexOf(str, pos) > -1;
  };
}
if (typeof String.prototype.startsWith !== 'function') {
  String.prototype.startsWith = function (str, pos) {
    pos = pos || 0;
    return this.substr(pos, str.length) === str;
  };
}
if (typeof Array.from !== 'function') {
  Array.from = function (arrLike, mapFn, thisArg) {
    var out = [];
    if (arrLike && typeof arrLike.length === 'number') {
      for (var i = 0; i < arrLike.length; i++) {
        var v = arrLike[i];
        out.push(mapFn ? mapFn.call(thisArg, v, i) : v);
      }
    }
    return out;
  };
}
if (typeof Number.isFinite !== 'function') {
  Number.isFinite = function (v) {
    return typeof v === 'number' && isFinite(v);
  };
}
if (typeof Number.isNaN !== 'function') {
  Number.isNaN = function (v) {
    return typeof v === 'number' && isNaN(v);
  };
}

// Promise polyfill（ES5 实现，基于 setTimeout 宏任务调度）
if (typeof Promise !== 'function') {
  (function () {
    var PENDING = 'pending';
    var FULFILLED = 'fulfilled';
    var REJECTED = 'rejected';
    function PromisePolyfill(fn) {
      var self = this;
      self._status = PENDING;
      self._value = undefined;
      self._callbacks = [];
      function settle(status, value) {
        if (self._status !== PENDING) return;
        self._status = status;
        self._value = value;
        var cbs = self._callbacks;
        self._callbacks = [];
        for (var i = 0; i < cbs.length; i++) cbs[i]();
      }
      function resolve(value) {
        settle(FULFILLED, value);
      }
      function reject(err) {
        settle(REJECTED, err);
      }
      setTimeout(function () {
        try {
          fn(resolve, reject);
        } catch (e) {
          reject(e);
        }
      }, 0);
    }
    PromisePolyfill.prototype.then = function (onFulfilled, onRejected) {
      var self = this;
      return new PromisePolyfill(function (resolve, reject) {
        function handle() {
          try {
            if (self._status === FULFILLED) {
              if (typeof onFulfilled === 'function') resolve(onFulfilled(self._value));else resolve(self._value);
            } else if (self._status === REJECTED) {
              if (typeof onRejected === 'function') resolve(onRejected(self._value));else reject(self._value);
            }
          } catch (e) {
            reject(e);
          }
        }
        if (self._status === PENDING) self._callbacks.push(handle);else handle();
      });
    };
    PromisePolyfill.prototype['catch'] = function (onRejected) {
      return this.then(null, onRejected);
    };
    PromisePolyfill.resolve = function (value) {
      return new PromisePolyfill(function (resolve) {
        resolve(value);
      });
    };
    PromisePolyfill.reject = function (err) {
      return new PromisePolyfill(function (resolve, reject) {
        reject(err);
      });
    };
    PromisePolyfill.all = function (arr) {
      return new PromisePolyfill(function (resolve, reject) {
        if (!arr || !arr.length) {
          resolve([]);
          return;
        }
        var results = [];
        var done = 0;
        for (var i = 0; i < arr.length; i++) {
          (function (idx) {
            var p = arr[idx];
            if (p && typeof p.then === 'function') {
              p.then(function (v) {
                results[idx] = v;
                done++;
                if (done === arr.length) resolve(results);
              }, function (e) {
                reject(e);
              });
            } else {
              results[idx] = p;
              done++;
              if (done === arr.length) resolve(results);
            }
          })(i);
        }
      });
    };
    PromisePolyfill.race = function (arr) {
      return new PromisePolyfill(function (resolve, reject) {
        for (var i = 0; i < arr.length; i++) {
          var p = arr[i];
          if (p && typeof p.then === 'function') p.then(resolve, reject);else resolve(p);
        }
      });
    };
    Promise = PromisePolyfill;
  })();
}

// 将通用方法挂载到global对象上，减少模块导入
if (typeof global !== 'undefined') {
  // 定时器管理器，用于清理所有定时器（用数组替代 Set，兼容精简运行时）
  global.timerManager = {
    timers: [],
    setTimeout: function (_setTimeout) {
      function setTimeout(_x, _x2) {
        return _setTimeout.apply(this, arguments);
      }
      setTimeout.toString = function () {
        return _setTimeout.toString();
      };
      return setTimeout;
    }(function (callback, delay) {
      var self = this;
      var timer = setTimeout(function () {
        var i = self.timers.indexOf(timer);
        if (i > -1) self.timers.splice(i, 1);
        callback();
      }, delay);
      this.timers.push(timer);
      return timer;
    }),
    clearTimeout: function (_clearTimeout) {
      function clearTimeout(_x3) {
        return _clearTimeout.apply(this, arguments);
      }
      clearTimeout.toString = function () {
        return _clearTimeout.toString();
      };
      return clearTimeout;
    }(function (timer) {
      clearTimeout(timer);
      var i = this.timers.indexOf(timer);
      if (i > -1) this.timers.splice(i, 1);
    }),
    clearAllTimers: function clearAllTimers() {
      for (var i = 0; i < this.timers.length; i++) {
        clearTimeout(this.timers[i]);
      }
      this.timers = [];
    }
  };

  // 常用工具函数
  global.utils = {
    // 防抖函数 - 使用定时器管理器
    debounce: function debounce(func, wait) {
      var timeout;
      return function executedFunction() {
        var args = arguments;
        var ctx = this;
        var later = function later() {
          global.timerManager.clearTimeout(timeout);
          func.apply(ctx, args);
        };
        global.timerManager.clearTimeout(timeout);
        timeout = global.timerManager.setTimeout(later, wait);
      };
    },
    // 节流函数 - 使用定时器管理器
    throttle: function throttle(func, limit) {
      var inThrottle;
      return function () {
        var args = arguments;
        var ctx = this;
        if (!inThrottle) {
          func.apply(ctx, args);
          inThrottle = true;
          global.timerManager.setTimeout(function () {
            inThrottle = false;
          }, limit);
        }
      };
    },
    // 安全的JSON解析
    safeJSONParse: function safeJSONParse(str, defaultValue) {
      try {
        return JSON.parse(str);
      } catch (e) {
        return defaultValue === undefined ? null : defaultValue;
      }
    },
    // 内存安全的字符串操作
    safeSubstring: function safeSubstring(str, start, length) {
      if (!str) return '';
      return str.substring(start, start + length);
    },
    // 批量内存释放
    releaseMemory: function releaseMemory() {
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