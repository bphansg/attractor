import { describe, it, expect } from 'vitest';
import { Context } from '../context.js';

describe('Context', () => {
  it('set/get works for basic values', () => {
    const ctx = new Context();
    ctx.set('key', 'value');
    expect(ctx.get('key')).toBe('value');
  });

  it('getString returns a string value', () => {
    const ctx = new Context();
    ctx.set('name', 'Alice');
    expect(ctx.getString('name')).toBe('Alice');
  });

  it('getString returns default when value is not a string', () => {
    const ctx = new Context();
    ctx.set('count', 42);
    expect(ctx.getString('count', 'fallback')).toBe('fallback');
  });

  it('getNumber returns a number value', () => {
    const ctx = new Context();
    ctx.set('count', 42);
    expect(ctx.getNumber('count')).toBe(42);
  });

  it('getNumber returns default when value is not a number', () => {
    const ctx = new Context();
    ctx.set('name', 'Alice');
    expect(ctx.getNumber('name', 99)).toBe(99);
  });

  it('getBoolean returns a boolean value', () => {
    const ctx = new Context();
    ctx.set('enabled', true);
    expect(ctx.getBoolean('enabled')).toBe(true);
  });

  it('getBoolean returns default when value is not boolean', () => {
    const ctx = new Context();
    ctx.set('name', 'yes');
    expect(ctx.getBoolean('name', false)).toBe(false);
  });

  it('has returns true for an existing key', () => {
    const ctx = new Context();
    ctx.set('exists', 'yes');
    expect(ctx.has('exists')).toBe(true);
  });

  it('has returns false for a missing key', () => {
    const ctx = new Context();
    expect(ctx.has('missing')).toBe(false);
  });

  it('delete removes a key', () => {
    const ctx = new Context();
    ctx.set('temp', 'data');
    expect(ctx.has('temp')).toBe(true);
    ctx.delete('temp');
    expect(ctx.has('temp')).toBe(false);
  });

  it('snapshot returns a deep copy of values', () => {
    const ctx = new Context();
    ctx.set('nested', { a: 1 });
    const snap = ctx.snapshot();
    expect(snap['nested']).toEqual({ a: 1 });

    // Mutating snapshot does not affect original
    (snap['nested'] as Record<string, number>).a = 999;
    expect((ctx.get('nested') as Record<string, number>).a).toBe(1);
  });

  it('clone creates an independent copy', () => {
    const ctx = new Context();
    ctx.set('x', 10);
    ctx.appendLog('entry1');

    const cloned = ctx.clone();
    cloned.set('x', 20);
    cloned.appendLog('entry2');

    expect(ctx.get('x')).toBe(10);
    expect(cloned.get('x')).toBe(20);
    expect(ctx.getLogs()).toEqual(['entry1']);
    expect(cloned.getLogs()).toEqual(['entry1', 'entry2']);
  });

  it('applyUpdates merges new values', () => {
    const ctx = new Context();
    ctx.set('a', 1);
    ctx.applyUpdates({ b: 2, c: 3 });
    expect(ctx.get('a')).toBe(1);
    expect(ctx.get('b')).toBe(2);
    expect(ctx.get('c')).toBe(3);
  });

  it('appendLog and getLogs work correctly', () => {
    const ctx = new Context();
    ctx.appendLog('first');
    ctx.appendLog('second');
    expect(ctx.getLogs()).toEqual(['first', 'second']);
  });

  it('getLogs returns a copy, not the internal array', () => {
    const ctx = new Context();
    ctx.appendLog('entry');
    const logs = ctx.getLogs();
    logs.push('tampered');
    expect(ctx.getLogs()).toEqual(['entry']);
  });

  it('constructor accepts initial values', () => {
    const ctx = new Context({ x: 1, y: 'hello' });
    expect(ctx.get('x')).toBe(1);
    expect(ctx.get('y')).toBe('hello');
  });
});
