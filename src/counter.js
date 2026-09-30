/**
 * counter.js
 *
 * Module: Counter Template Helper
 * Purpose: Keeps the Vite starter counter demo helper for wiring a click-to-increment
 *          element in the default template.
 */

/**
 * Sets up click event listener to increment a counter on a target element.
 * @param {HTMLElement} element - Target DOM element
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
