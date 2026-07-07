import { afterEach, describe, expect, it, vi } from 'vitest';

const originalAge = process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalAge === undefined) delete process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS;
  else process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS = originalAge;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe('question report account-age configuration', () => {
  it('uses a secure 24-hour default', async () => {
    delete process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS;
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    const { config } = await import('./config.js');
    expect(config.questionReportMinAccountAgeHours).toBe(24);
  });

  it('accepts zero for controlled test environments', async () => {
    process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS = '0';
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    const { config } = await import('./config.js');
    expect(config.questionReportMinAccountAgeHours).toBe(0);
  });

  it.each(['-1', '1.5', 'abc', ' '])('rejects invalid value %j', async (value) => {
    process.env.QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS = value;
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    await expect(import('./config.js')).rejects.toThrow('QUESTION_REPORT_MIN_ACCOUNT_AGE_HOURS');
  });
});
