import { describe, it, expect } from 'vitest';
import { normalizeUrl, extractHost, hashStringList } from './urlNormalize';

describe('normalizeUrl', () => {
  it('adds https:// when missing', () => {
    expect(normalizeUrl('example.com')).toEqual({
      canonicalUrl: 'https://example.com',
      host: 'example.com',
      origin: 'https://example.com',
    });
  });

  it('lowercases the host', () => {
    expect(normalizeUrl('https://Example.COM')).toMatchObject({ host: 'example.com' });
  });

  it('strips www.', () => {
    expect(normalizeUrl('https://www.example.com')).toMatchObject({ host: 'example.com' });
  });

  it('drops the path', () => {
    expect(normalizeUrl('https://example.com/about/team?x=1')).toMatchObject({
      canonicalUrl: 'https://example.com',
      host: 'example.com',
    });
  });

  it('returns null for invalid input', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('http://')).toBeNull();
  });

  it('returns null for hosts without a TLD', () => {
    expect(normalizeUrl('localhost')).toBeNull();
  });

  it('preserves http when explicitly given (origin reflects scheme)', () => {
    expect(normalizeUrl('http://example.com')).toMatchObject({
      canonicalUrl: 'https://example.com', // canonical is always https
      origin: 'http://example.com',
    });
  });
});

describe('extractHost', () => {
  it('returns the host or null', () => {
    expect(extractHost('https://www.foo.com/x')).toBe('foo.com');
    expect(extractHost('not a url')).toBeNull();
  });
});

describe('hashStringList', () => {
  it('is order-independent', () => {
    expect(hashStringList(['a', 'b', 'c'])).toBe(hashStringList(['c', 'a', 'b']));
  });

  it('is case- and whitespace-insensitive', () => {
    expect(hashStringList(['  Foo  ', 'BAR'])).toBe(hashStringList(['foo', 'bar']));
  });

  it('changes when content changes', () => {
    expect(hashStringList(['a', 'b'])).not.toBe(hashStringList(['a', 'b', 'c']));
  });

  it('drops empty strings', () => {
    expect(hashStringList(['a', '', '   '])).toBe(hashStringList(['a']));
  });
});
