import '@testing-library/jest-dom';

// Recharts (ResponsiveContainer) uses ResizeObserver, which jsdom doesn't provide.
/* global global */
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
