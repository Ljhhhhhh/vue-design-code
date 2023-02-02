// * 代理 Set Map

let bucket = new WeakMap()
const ITERATE_KEY = Symbol();
const MAP_KEY_ITERATE_KEY = Symbol()

// 用一个全局变量存储当前激活的 effect 函数
let activeEffect;
// 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true;

export function track (target, key) {
  // 当禁止追踪时，直接返回
  if (!activeEffect || !shouldTrack) return;
  // 根据 target 从桶中取得 depsMap, 它也是一个 Map 类型：key -> effects
  let depsMap = bucket.get(target);
  // 如果不存在 depsMap, 那么新建一个 Map 并与 target 关联
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }
  // 再根据 key 从 depsMap 中取得 deps，它是一个 Set 类型，
  // 里面存储着所有与当前 key 关联的副作用函数：effects
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }
  // 把当前激活的副作用函数添加到依赖集合 deps 中
  deps.add(activeEffect)
  // 将其添加到 activeEffect.deps 数组中
  activeEffect.deps.push(deps)
}

export function trigger (target, key, type, newVal) {
  // 根据 target 从桶中取得 depsMap，它是 key --> effects
  const depsMap = bucket.get(target)
  if (!depsMap) return;
  const effects = depsMap.get(key)

  const effectsToRun = new Set()
  effects && effects.forEach(effectFn => {
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn)
    }
  })

  if (
    type === 'ADD' ||
    type === 'DELETE' ||
    (
      type === 'SET' &&
      Object.prototype.toString.call(target) === '[object Map]'
    )
  ) {
    const iterateEffects = depsMap.get(ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  if ((
    type === 'ADD' || type === 'DELETE') &&
    Object.prototype.toString.call(target) === '[object Map]'
  ) {
    const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  if (type === 'ADD' && Array.isArray(target)) {
    const lengthEffects = depsMap.get('length')
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  if (Array.isArray(target) && key === 'length') {
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach(effectFn => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
      }
    })
  }

  effectsToRun.forEach(effectFn => {
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      effectFn()
    }
  })
}

// effect 栈
const effectStack = [];
export function effect (fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn)
    // 当 effectFn 执行时，将其设置为当前激活的副作用函数
    activeEffect = effectFn
    // 在调用副作用函数之前将当前副作用函数压入栈中
    effectStack.push(effectFn)
    // 将 fn 的执行结果存储到 res 中
    const res = fn()
    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]

    // 将 res 作为 effectFn 的返回值
    return res;
  }
  // 将 options 挂载到 effectFn 上
  effectFn.options = options;
  // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = []
  // 只有非 lazy 的时候，才执行
  if (!options.lazy) {
    effectFn()
  }
  // 将副作用函数作为返回值返回
  return effectFn
}

function cleanup (effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }
  effectFn.deps.length = 0
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map()

export function reactive (obj) {
  // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existProxy = reactiveMap.get(obj)
  if (existProxy) return existProxy
  // 否则，创建新的对象
  const proxy = createReactive(obj)
  // 存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy)
  return proxy
}
function shallowReactive (obj) {
  return createReactive(obj, true)
}
function readonly (obj) {
  return createReactive(obj, false, true)
}
function shallowReadonly (obj) {
  return createReactive(obj, true, true)
}

const mutableInstrumentations = {
  add (key) {
    // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
    const target = this.raw
    const hasKey = target.has(key)
    // 通过原始数据对象执行 add 方法添加具体的值，
    // 注意，这里不需要 .bind 了，因为是直接通过 target 调用并执行的
    const res = target.add(key);
    if (!hasKey) {
      trigger(target, key, TriggerType.ADD)
    }
    return res;
  },
  delete (key) {
    const target = this.raw
    const hasKey = target.has(key)
    const res = target.add(key);
    if (!hasKey) {
      trigger(target, key, TriggerType.DELETE)
    }
    return res;
  },
  get (key) {
    const target = this.raw
    const had = target.has(key)
    track(target, key)
    if (had) {
      const res = target.get(key)
      return typeof res === 'object' ? reactive(res) : res
    }
  },
  set (key, value) {
    const target = this.raw;
    const had = target.has(key);
    const oldVal = target.get(key);
    const rawValue = value.raw || value;
    target.set(key, rawValue);
    if (!had) {
      trigger(target, key, TriggerType.ADD)
    } else if (oldVal !== value || (oldVal === oldVal && value === value)) {
      // 如果不存在，并且值变了，则是 SET 类型的操作
      trigger(target, key, TriggerType.SET)
    }
  },
  forEach (callback, thisArg) {
    // wrap 函数用来把可代理的值传唤为响应式数据
    const wrap = (val) => typeof val === 'object' ? reactive(val) : val
    const target = this.raw;
    // 与 ITERATE_KEY 建立响应联系
    track(target, ITERATE_KEY);
    target.forEach((v, k) => {
      // 手动调用 callback，用 wrap 函数包裹 value 和 key 后再传给 callback
      // 这样就实现了深响应
      callback.call(thisArg, wrap(v), wrap(k), this)
    })
  },
  [Symbol.iterator]: iterationMethod,
  entries: iterationMethod,
  values: valuesIterationMethod,
  keys: keysIterationMethod
}

function iterationMethod () {
  const target = this.raw;
  // 获取原始数据对象的 target
  const itr = target[Symbol.iterator]()
  const wrap = (val) => typeof val === 'object' && val != null ? reactive(val) : val
  track(target, ITERATE_KEY)
  // 返回自定义的迭代器
  return {
    next () {
      // 调用原始迭代器的 next 方法获取 value 和 done
      const { value, done } = itr.next();
      return {
        // 如果 value 不是 undefined,则对齐进行包裹
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done
      }
    },
    [Symbol.iterator] () {
      return this
    }
  }
}

function valuesIterationMethod () {
  const target = this.raw;
  const itr = target.values();
  const wrap = (val) => typeof val === 'object' && val != null ? reactive(val) : val
  track(target, ITERATE_KEY)

  return {
    next () {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done,
      }
    },
    [Symbol.iterator] () {
      return this;
    }
  }
}

function keysIterationMethod () {
  const target = this.raw;
  const itr = target.keys();
  const wrap = (val) => typeof val === 'object' && val != null ? reactive(val) : val
  track(target, MAP_KEY_ITERATE_KEY)

  return {
    next () {
      const { value, done } = itr.next();
      return {
        value: wrap(value),
        done,
      }
    },
    [Symbol.iterator] () {
      return this;
    }
  }
}

// 封装 createReactive 函数，接收一个参数 isShallow，代表是否为浅响应，默认为 false，即非浅响应
function createReactive (obj, isShallow = false, isReadOnly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get (target, key, receiver) {
      if (key === 'raw') {
        return target
      }
      if (key === 'size') {
        track(target, ITERATE_KEY)
        return Reflect.get(target, key, target)
      }

      // 如果操作的目标对象是数组，并且 key 存在与 arrayInstrumentations 上
      // 那么返回定义在 arrayInstrumentations 的值
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      if (!isReadOnly && typeof key !== 'symbol') {
        track(target, key)
      }

      const res = Reflect.get(target, key, receiver)

      if (!isReadOnly) {
        track(target, key)
      }

      // 如果是浅响应，则直接返回原始值
      if (isShallow) {
        return res
      }
      if (typeof res === 'object' && res !== null) {
        return isReadOnly ? readonly(res) : reactive(res)
      }

      // return res
      return mutableInstrumentations[key]
    },
    set (target, key, newVal, receiver) {
      if (isReadOnly) {
        console.log(`属性 ${key} 是只读的`);
        return true
      }
      const oldVal = target[key]

      const type = Array.isArray(target)
        ? Number(key) < target.length
          ? TriggerType.SET
          : TriggerType.ADD
        : Object.prototype.hasOwnProperty.call(target, key)
          ? 'SET' : 'ADD'
      const res = Reflect.set(target, key, newVal, receiver)

      // target === receiver.raw 说明 receiver 就是 target 的代理对象
      if (target === receiver.raw) {
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type, newVal)
        }
      }

      return res
    },
    ownKeys (target) {
      // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立联系
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },
    deleteProperty (target, key) {
      if (isReadOnly) {
        console.log(`属性 ${key} 是只读的`);
        return true
      }
      const hasKey = Object.prototype.hasOwnProperty.call(target, key)
      const res = Reflect.deleteProperty(target, key);
      if (res && hasKey) {
        trigger(target, key, TriggerType.DELETE)
      }
      return res
    }
    // 省略其他拦截函数
  })
}

const TriggerType = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE'
}

const arrayInstrumentations = {};

['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function (...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
    let res = originMethod.apply(this, args)

    if (res === false || res === -1) {
      // res 为 false 说明没找到，通过 this.raw 拿到原始数组，再去其中查找，并更新 res 值
      res = originMethod.apply(this.raw, args)
    }
    // 返回最终结果
    return res
  }
})


// 重写数组的 push 方法
['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
  // 取得原始 push 方法
  const originMethod = Array.prototype[method]
  // 重写
  arrayInstrumentations[method] = function (...args) {
    // 在调用原始方法之前，禁止追踪
    shouldTrack = false
    // push 方法的默认行为
    let res = originMethod.apply(this, args)
    // 在调用原始方法之后，恢复原来的行为，即允许追踪
    shouldTrack = true
    return res
  }
})
