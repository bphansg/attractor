import { describe, it, expect } from 'vitest';
import { Message } from '../types/message.js';
import type { ContentPart } from '../types/message.js';

describe('Message constructors', () => {
  it('system() creates a message with system role', () => {
    const msg = Message.system('You are a helpful assistant.');

    expect(msg.role).toBe('system');
    expect(msg.content).toBe('You are a helpful assistant.');
  });

  it('user() creates a message with string content', () => {
    const msg = Message.user('Hello, world!');

    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello, world!');
  });

  it('user() creates a message with ContentPart array', () => {
    const parts: ContentPart[] = [
      { kind: 'text', text: 'Describe this image:' },
      {
        kind: 'image',
        source: { type: 'url', url: 'https://example.com/img.png' },
      },
    ];

    const msg = Message.user(parts);

    expect(msg.role).toBe('user');
    expect(Array.isArray(msg.content)).toBe(true);
    expect((msg.content as ContentPart[]).length).toBe(2);
  });

  it('assistant() creates a message with assistant role', () => {
    const msg = Message.assistant('Sure, I can help with that.');

    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('Sure, I can help with that.');
  });
});

describe('Message.text()', () => {
  it('extracts text from string content', () => {
    const msg = Message.user('plain text');

    expect(Message.text(msg)).toBe('plain text');
  });

  it('extracts and joins text from ContentPart array', () => {
    const parts: ContentPart[] = [
      { kind: 'text', text: 'Line one' },
      { kind: 'image', source: { type: 'url', url: 'https://example.com/img.png' } },
      { kind: 'text', text: 'Line two' },
    ];

    const msg = Message.user(parts);

    expect(Message.text(msg)).toBe('Line one\nLine two');
  });
});
