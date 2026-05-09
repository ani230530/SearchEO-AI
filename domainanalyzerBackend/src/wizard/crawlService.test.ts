import { describe, it, expect } from 'vitest';
import { inferCompanySize } from './crawlService';

describe('inferCompanySize', () => {
  it('returns smb for empty input', () => {
    expect(inferCompanySize('')).toBe('smb');
    expect(inferCompanySize(null)).toBe('smb');
    expect(inferCompanySize(undefined)).toBe('smb');
  });

  it('detects enterprise', () => {
    expect(inferCompanySize('We are a Fortune 500 company.')).toBe('enterprise');
    expect(inferCompanySize('listed on NYSE')).toBe('enterprise');
    expect(inferCompanySize('publicly traded enterprise')).toBe('enterprise');
  });

  it('detects mid', () => {
    expect(inferCompanySize('A 350 employees company growing fast.')).toBe('mid');
    expect(inferCompanySize('Series B startup')).toBe('mid');
    expect(inferCompanySize('mid-market firm')).toBe('mid');
  });

  it('detects solo', () => {
    expect(inferCompanySize('I am a freelancer offering design services.')).toBe('solo');
    expect(inferCompanySize('self-employed consultant')).toBe('solo');
  });

  it('falls back to smb for ambiguous text', () => {
    expect(inferCompanySize('We help businesses grow online.')).toBe('smb');
    expect(inferCompanySize('Our platform offers analytics.')).toBe('smb');
  });
});
