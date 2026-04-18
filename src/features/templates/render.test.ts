import { describe, expect, it } from 'vitest';
import { renderTemplate } from './render';

/**
 * renderTemplate unit tests — Phase 7.
 *
 * Covers the three branches that matter:
 *   - known variable → substituted
 *   - unknown variable → left as literal (no crash, no empty substitution)
 *   - multiple occurrences + mixed known/unknown on the same line
 */
describe('renderTemplate', () => {
  it('substitutes known variables', () => {
    const out = renderTemplate('Hi [name], for [service].', {
      name: 'Jane',
      service: 'Mowing',
    });
    expect(out).toBe('Hi Jane, for Mowing.');
  });

  it('leaves unknown variables as literal text', () => {
    const out = renderTemplate('Hi [name], see [unknown_thing] later.', {
      name: 'Jane',
    });
    expect(out).toBe('Hi Jane, see [unknown_thing] later.');
  });

  it('handles a template with only unknown variables (no crash)', () => {
    const out = renderTemplate('[foo] [bar] [baz]', {});
    expect(out).toBe('[foo] [bar] [baz]');
  });

  it('substitutes repeated occurrences of the same variable', () => {
    const out = renderTemplate('[name] · [name]', { name: 'Jane' });
    expect(out).toBe('Jane · Jane');
  });

  it('mixes known and unknown on one line', () => {
    const out = renderTemplate('Hi [name], [unknown] - [service]', {
      name: 'Jane',
      service: 'Mowing',
    });
    expect(out).toBe('Hi Jane, [unknown] - Mowing');
  });

  it('allows whitespace inside brackets', () => {
    const out = renderTemplate('Hi [ name ] - [  service ]', {
      name: 'Jane',
      service: 'Mowing',
    });
    expect(out).toBe('Hi Jane - Mowing');
  });

  it('leaves empty-string values as empty', () => {
    const out = renderTemplate('Hi [name] [suffix]', {
      name: 'Jane',
      suffix: '',
    });
    expect(out).toBe('Hi Jane ');
  });

  it('returns empty/falsy bodies unchanged', () => {
    expect(renderTemplate('', { name: 'Jane' })).toBe('');
  });

  it('ignores bracketed text that does not match the variable grammar', () => {
    // Numbers and hyphens are not valid placeholder keys per our regex.
    const out = renderTemplate('meet at [913-309-7340] [123abc]', {
      name: 'Jane',
    });
    expect(out).toBe('meet at [913-309-7340] [123abc]');
  });

  it('does not cross line boundaries in a single placeholder', () => {
    const out = renderTemplate('[na\nme]', { name: 'Jane' });
    expect(out).toBe('[na\nme]');
  });
});
