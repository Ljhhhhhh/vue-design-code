// 存储副作用函数的桶
const bucket = new Set()

function effect () {
  document.body.innerText = obj.text
}
// 原始数据
const data = { text: 'hello world' } // 对原始数据的代理
const obj = new Proxy(data, {
  get (target, key) {
    bucket.add(effect)
    return target[key]
  },
  set (target, key, newVal) {
    target[key] = newVal

    bucket.forEach(fn => fn())

    return true
  }
})

effect()

setTimeout(() => {
  obj.text = 'hello vue3'
}, 1000)