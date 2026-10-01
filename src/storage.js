/**
 * 存储管理器（基于 @system.storage 异步 API + 内存缓存同步兼容层）
 * 说明：
 *   - 不顶层 import @system.storage：低内存/精简设备（如小米手环10）可能缺失该系统模块，
 *     顶层 import 会在模块加载时立即抛异常导致启动崩溃。改为惰性 require + try/catch 探测。
 *   - @system.storage 仅提供异步 get/set/delete/clear，而 favorites.js / app.ux 依赖同步
 *     getSync/setSync，故用内存缓存模拟：启动时 warmup 预读已知 key，getSync/setSync 直接
 *     读写缓存，setSync 同时异步持久化。
 *   - 存储模块缺失时：getSync/setSync 仍可用（仅内存缓存，不持久化），回调式 API 直接走
 *     fail/complete，应用不崩溃。
 * 全部为 ES5 风格，不依赖 class / async / Promise / Set，避免精简运行时崩溃。
 */

// 已知存储 key（启动预读，保证 getSync 同步可用）
var KNOWN_KEYS = ['favorites', 'manual_dictionary', 'ai_dictionary', 'ai_word_count', 'ui_style']

var _cache = {}

// 惰性获取系统存储模块
var _storageMod = null
var _storageChecked = false
function getStorageModule() {
  if (_storageChecked) return _storageMod
  _storageChecked = true
  try {
    if (typeof require === 'function') {
      _storageMod = require('@system.storage')
    }
  } catch (e) {
    _storageMod = null
  }
  return _storageMod
}

function warmup() {
  var mod = getStorageModule()
  if (!mod || typeof mod.get !== 'function') return
  for (var i = 0; i < KNOWN_KEYS.length; i++) {
    (function (key) {
      try {
        mod.get({
          key: key,
          success: function (data) { _cache[key] = data },
          fail: function () {}
        })
      } catch (e) {}
    })(KNOWN_KEYS[i])
  }
}

function defaultValue(param) {
  return (param && param.default !== undefined) ? param.default : ''
}

function doFail(param, err) {
  if (param && param.fail) {
    try { param.fail(err) } catch (e) {}
  }
  if (param && param.complete) {
    try { param.complete() } catch (e) {}
  }
}

function doSuccess(param, value) {
  if (param && param.success) {
    try { param.success(value) } catch (e) {}
  }
  if (param && param.complete) {
    try { param.complete() } catch (e) {}
  }
}

var storageFile = {
  // 同步读（内存缓存，未就绪返回默认值）
  getSync: function (param) {
    var key = param && param.key
    return _cache[key] === undefined ? defaultValue(param) : _cache[key]
  },

  // 同步写（写缓存 + 异步持久化；存储模块缺失时仅写缓存）
  setSync: function (param) {
    try {
      if (param) _cache[param.key] = param.value
      var mod = getStorageModule()
      if (mod && typeof mod.set === 'function') {
        mod.set({ key: param.key, value: param.value, fail: function () {} })
      }
      return true
    } catch (e) {
      return false
    }
  },

  get: function (param) {
    try {
      var mod = getStorageModule()
      if (!mod || typeof mod.get !== 'function') {
        // 降级：直接返回内存缓存
        var value = this.getSync(param)
        _cache[param.key] = value
        doSuccess(param, value)
        return
      }
      mod.get({
        key: param.key,
        success: function (data) {
          _cache[param.key] = data
          doSuccess(param, data)
        },
        fail: function () {
          var v = _cache[param.key]
          if (v === undefined) v = defaultValue(param)
          doSuccess(param, v)
        }
      })
    } catch (e) {
      doFail(param, e)
    }
  },

  set: function (param) {
    try {
      var mod = getStorageModule()
      if (!mod || typeof mod.set !== 'function') {
        // 降级：仅写内存缓存
        if (param) _cache[param.key] = param.value
        doSuccess(param)
        return
      }
      mod.set({
        key: param.key,
        value: param.value,
        success: function () {
          if (param) _cache[param.key] = param.value
          doSuccess(param)
        },
        fail: function (err) {
          doFail(param, err)
        }
      })
    } catch (e) {
      doFail(param, e)
    }
  },

  delete: function (param) {
    try {
      var mod = getStorageModule()
      if (!mod || typeof mod.delete !== 'function') {
        delete _cache[param.key]
        doSuccess(param)
        return
      }
      mod.delete({
        key: param.key,
        success: function () {
          delete _cache[param.key]
          doSuccess(param)
        },
        fail: function (err) {
          doFail(param, err)
        }
      })
    } catch (e) {
      doFail(param, e)
    }
  },

  clear: function (param) {
    try {
      var mod = getStorageModule()
      if (!mod || typeof mod.clear !== 'function') {
        for (var k in _cache) delete _cache[k]
        doSuccess(param)
        return
      }
      mod.clear({
        success: function () {
          for (var k in _cache) delete _cache[k]
          doSuccess(param)
        },
        fail: function (err) {
          doFail(param, err)
        }
      })
    } catch (e) {
      doFail(param, e)
    }
  }
}

warmup()

export default storageFile
