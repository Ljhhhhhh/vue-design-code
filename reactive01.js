let activeEffect;
const bucket = new WeakMap()

const data = {
  name: 'lujh',
  age: 23
}

/* 
  {
    [data]: {
      [key]: deps
    }
  }
*/
const obj = new Proxy(data, {
  get (target, key) {
    if (!activeEffect) return target[key]

    let depsMap = bucket.get(target)
    if (!depsMap) {
      bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key);
    if (!deps) {
      depsMap.set(key, (deps = new Set()))
    }

    deps.add(activeEffect)
    return target[key]
  },

  set (target, key, newVal) {
    target[key] = newVal
    const depsMaps = bucket.get(target)
    if (!depsMaps) return;
    const effects = depsMaps.get(key)
    effects && effects.forEach(fn => fn())
  }
})


function effect (fn) {
  activeEffect = fn;
  fn()
}


effect(() => {
  document.body.innerText = obj.age
})



setTimeout(() => {
  obj.age = 24
}, 2000)
