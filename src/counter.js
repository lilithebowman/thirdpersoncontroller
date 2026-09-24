/**
 * counter.js
 * 
 * Provides a simple counter setup function that attaches to a DOM element and updates its content on click.
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
