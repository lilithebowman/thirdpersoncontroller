/**
 * counter.js
 *
 * Keeps the Vite starter counter demo helper for wiring a click-to-increment
 * element in the default template.
 */

export function setupCounter(element) {
  let counter = 0
  const setCounter = (count) => {
    counter = count
    element.innerHTML = `Count is ${counter}`
  }
  element.addEventListener('click', () => setCounter(counter + 1))
  setCounter(0)
}
