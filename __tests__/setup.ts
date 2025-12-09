// Jest setup file
// Add any global test setup here

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  global.console = {
    ...console,
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
