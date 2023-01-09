let activeEffect;
let bucket = new WeakMap()

const data = {
  ok: true,
  text: 'hello world'
}

function effect (fn) {
  const effectFn = () => {
    // 当 effectFn 执行时，将其设置为当前激活的副作用函数
    activeEffect = effectFn
    fn()
  }
  // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = []
  effectFn()
}

const obj = new Proxy(data, {
  get (target, key) {
    track(target, key)
    return target[key]
  },

  set (target, key, newVal) {
    target[key] = newVal
    trigger(target, key)
  }
})

function track (target, key) {

  if (!activeEffect) return;
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
}

function trigger (target, key) {
  console.log(key, 'console key')
  // 根据 target 从桶中取得 depsMap，它是 key --> effects
  const depsMap = bucket.get(target)
  if (!depsMap) return;
  // 根据 key 取得所有副作用函数 effects
  const effects = depsMap.get(key)
  effects && effects.forEach(fn => fn())
}

effect(() => {
  document.body.innerText = obj.ok ? obj.text : 'not'
})

// setTimeout(() => {
//   obj.text = 'hello vue3'
// }, 2000)


setTimeout(() => {
  obj.ok = false
}, 1000)

setTimeout(() => {
  obj.text = 'hello vue3'
}, 2000)