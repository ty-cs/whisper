import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPIRED_SENTINEL, formatTimeLeft } from './format-time-left.js';

describe('formatTimeLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it('returns EXPIRED_SENTINEL when already expired', () => {
    expect(formatTimeLeft(nowSeconds() - 1)).toBe(EXPIRED_SENTINEL);
  });

  it('returns EXPIRED_SENTINEL at exactly 0 seconds remaining', () => {
    expect(formatTimeLeft(nowSeconds())).toBe(EXPIRED_SENTINEL);
  });

  it('formats seconds only', () => {
    expect(formatTimeLeft(nowSeconds() + 45)).toBe('45s');
  });

  it('formats exactly 1 second', () => {
    expect(formatTimeLeft(nowSeconds() + 1)).toBe('1s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeLeft(nowSeconds() + 90)).toBe('1m 30s');
  });

  it('formats exactly 60 seconds as 1m 0s', () => {
    expect(formatTimeLeft(nowSeconds() + 60)).toBe('1m 0s');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTimeLeft(nowSeconds() + 3661)).toBe('1h 1m 1s');
  });

  it('formats exactly 1 hour as 1h 0m 0s', () => {
    expect(formatTimeLeft(nowSeconds() + 3600)).toBe('1h 0m 0s');
  });

  it('formats days, hours, and minutes (omits seconds)', () => {
    expect(formatTimeLeft(nowSeconds() + 86400 + 3600 + 60)).toBe('1d 1h 1m');
  });

  it('formats exactly 1 day as 1d 0h 0m', () => {
    expect(formatTimeLeft(nowSeconds() + 86400)).toBe('1d 0h 0m');
  });

  it('formats multiple days', () => {
    expect(formatTimeLeft(nowSeconds() + 7 * 86400)).toBe('7d 0h 0m');
  });
});
