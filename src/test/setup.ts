import '@testing-library/jest-dom'

// jsdom does not implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') },
  writable: true,
  configurable: true,
})
