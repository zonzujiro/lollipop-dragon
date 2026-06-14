import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom does not implement matchMedia, which xterm uses for DPR changes
Object.defineProperty(window, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }),
  writable: true,
  configurable: true,
});

// jsdom does not implement canvas text measurement, which xterm uses at startup
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    measureText: (text: string) => ({ width: text.length * 7 }),
  }),
  writable: true,
  configurable: true,
});

// jsdom does not implement navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(""),
  },
  writable: true,
  configurable: true,
});
