// Jest setup file
// Add any global test setup here

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  log: jest.fn(),
};
