import '@testing-library/jest-dom';

// Recharts (ResponsiveContainer) uses ResizeObserver, which jsdom doesn't provide.
/* global global */
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{
      target,
      contentRect: { width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400 },
    }], this);
  }
  unobserve() {}
  disconnect() {}
};
