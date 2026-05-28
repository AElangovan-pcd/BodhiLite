import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { scrubSentryEvent } from './scrub';
import type { Event } from '@sentry/nextjs';

const HMAC_KEY = 'test-hmac-key-do-not-use-in-prod';

const hashUserId = (key: string) => (id: string) =>
  createHmac('sha256', key).update(id).digest('hex').slice(0, 12);

const defaultOpts = { hashUserId: hashUserId(HMAC_KEY) };

function makeEvent(overrides: Record<string, unknown> = {}): Event {
  return {
    event_id: 'evt-1',
    message: 'something broke',
    ...overrides,
  } as unknown as Event;
}

describe('scrubSentryEvent', () => {
  it('returns the event with no-op changes when there is no PII', () => {
    const e = makeEvent({ message: 'plain error' });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.message).toBe('plain error');
  });

  it('scrubs request.data (POST body)', () => {
    const e = makeEvent({
      request: { data: 'answer=42&studentEmail=a@b.com' } as Event['request'],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.request?.data).toBe('[scrubbed]');
  });

  it('scrubs request.query_string', () => {
    const e = makeEvent({
      request: { query_string: 'token=abc&email=a@b.com' } as Event['request'],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.request?.query_string).toBe('[scrubbed]');
  });

  it('deletes request.cookies', () => {
    const e = makeEvent({
      request: { cookies: { session: 'abc' } } as unknown as Event['request'],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.request?.cookies).toBeUndefined();
  });

  it('scrubs authorization + cookie + x-supabase-* request headers (preserves keys)', () => {
    const e = makeEvent({
      request: {
        headers: {
          authorization: 'Bearer abc',
          Cookie: 'session=xyz',
          'x-supabase-auth': 'token',
          'user-agent': 'Mozilla/5.0',
        },
      } as Event['request'],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const h = out.request?.headers as Record<string, string>;
    expect(h.authorization).toBe('[scrubbed]');
    expect(h.Cookie).toBe('[scrubbed]');
    expect(h['x-supabase-auth']).toBe('[scrubbed]');
    expect(h['user-agent']).toBe('Mozilla/5.0');
  });

  it('deletes user.email / user.username / user.ip_address', () => {
    const e = makeEvent({
      user: {
        id: 'u-1',
        email: 'a@b.com',
        username: 'alice',
        ip_address: '1.2.3.4',
      },
    });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.user?.email).toBeUndefined();
    expect(out.user?.username).toBeUndefined();
    expect(out.user?.ip_address).toBeUndefined();
  });

  it('replaces user.id with a 12-char hash that is deterministic per key (server config path)', () => {
    const e1 = makeEvent({ user: { id: 'user-uuid-1' } });
    const out1 = scrubSentryEvent(e1, defaultOpts);
    const out2 = scrubSentryEvent(makeEvent({ user: { id: 'user-uuid-1' } }), defaultOpts);
    expect(out1.user?.id).toHaveLength(12);
    expect(out1.user?.id).not.toBe('user-uuid-1');
    expect(out1.user?.id).toBe(out2.user?.id);
  });

  it('produces different hashes for the same user.id with different keys', () => {
    const e = makeEvent({ user: { id: 'user-uuid-1' } });
    const a = scrubSentryEvent(e, { hashUserId: hashUserId('key-a') });
    const b = scrubSentryEvent(makeEvent({ user: { id: 'user-uuid-1' } }), {
      hashUserId: hashUserId('key-b'),
    });
    expect(a.user?.id).not.toBe(b.user?.id);
  });

  it('collapses user.id to "[scrubbed]" when no hashUserId is injected (edge runtime path)', () => {
    const e = makeEvent({ user: { id: 'user-uuid-1', email: 'a@b.com' } });
    const out = scrubSentryEvent(e);
    expect(out.user?.id).toBe('[scrubbed]');
    expect(out.user?.email).toBeUndefined();
  });

  it('recursively scrubs emails from event.extra at depth 3', () => {
    const e = makeEvent({
      extra: {
        depth1: {
          depth2: {
            depth3: { studentEmail: 'a@b.com' },
          },
        },
      },
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const extra = out.extra as Record<string, unknown>;
    const d1 = extra.depth1 as Record<string, unknown>;
    const d2 = d1.depth2 as Record<string, unknown>;
    const d3 = d2.depth3 as Record<string, unknown>;
    expect(d3.studentEmail).toBe('[scrubbed-email]');
  });

  it('scrubs breadcrumb body / requestBody / responseBody', () => {
    const e = makeEvent({
      breadcrumbs: [
        {
          category: 'fetch',
          data: { body: 'answer=42', requestBody: 'a@b.com', responseBody: '{"x":1}' },
        },
      ],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const bc = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(bc.body).toBe('[scrubbed]');
    expect(bc.requestBody).toBe('[scrubbed]');
    expect(bc.responseBody).toBe('[scrubbed]');
  });

  it('recursively scrubs emails in breadcrumb data (non-body keys)', () => {
    const e = makeEvent({
      breadcrumbs: [{ category: 'fetch', data: { extraField: 'a@b.com' } }],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const bc = out.breadcrumbs?.[0]?.data as Record<string, unknown>;
    expect(bc.extraField).toBe('[scrubbed-email]');
  });

  it('does not throw on a malformed event with non-object request', () => {
    const e = makeEvent({ request: 'not-an-object' as unknown as Event['request'] });
    expect(() => scrubSentryEvent(e, defaultOpts)).not.toThrow();
  });

  it('property test: no email-regex match survives anywhere in output JSON', () => {
    const random = {
      a: 'first.last@example.edu',
      b: { c: 'nested student.id@piercecollege.edu in deeper field' },
      d: ['array', 'of', 'mixed', 'edge@case.com'],
    };
    const e = makeEvent({ extra: random });
    const out = scrubSentryEvent(e, defaultOpts);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it('handles circular references in event.extra without throwing', () => {
    const o: Record<string, unknown> = {};
    o['self'] = o;
    const e = makeEvent({ extra: o });
    expect(() => scrubSentryEvent(e, defaultOpts)).not.toThrow();
  });

  it('handles user with no id (empty id branch)', () => {
    const e = makeEvent({ user: { email: 'a@b.com' } });
    const out = scrubSentryEvent(e, defaultOpts);
    expect(out.user?.email).toBeUndefined();
    expect(out.user?.id).toBeUndefined();
  });

  it('passes through non-string primitives (numbers, booleans, null) in scrubRecursive', () => {
    const e = makeEvent({
      extra: {
        count: 42,
        flag: false,
        nothing: null,
      },
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const extra = out.extra as Record<string, unknown>;
    expect(extra.count).toBe(42);
    expect(extra.flag).toBe(false);
    expect(extra.nothing).toBeNull();
  });

  it('scrubs emails from event.contexts', () => {
    const e = makeEvent({
      contexts: {
        app: { app_name: 'BodhiLite', user_email: 'student@school.edu' } as Record<string, unknown>,
      },
    });
    const out = scrubSentryEvent(e, defaultOpts);
    const ctx = out.contexts as Record<string, unknown>;
    const app = ctx.app as Record<string, unknown>;
    expect(app.user_email).toBe('[scrubbed-email]');
    expect(app.app_name).toBe('BodhiLite');
  });

  it('handles circular array references in event.extra without throwing', () => {
    const arr: unknown[] = ['a@b.com'];
    arr.push(arr); // circular array
    const e = makeEvent({ extra: { items: arr } });
    expect(() => scrubSentryEvent(e, defaultOpts)).not.toThrow();
  });

  it('handles non-object request.headers gracefully', () => {
    const e = makeEvent({
      request: {
        headers: 'raw-header-string' as unknown as Record<string, string>,
      } as Event['request'],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    // non-object headers pass through unchanged
    expect(out.request?.headers).toBe('raw-header-string');
  });

  it('handles non-object breadcrumb data gracefully', () => {
    const e = makeEvent({
      breadcrumbs: [
        { category: 'fetch', data: 'raw-string' as unknown as Record<string, unknown> },
      ],
    });
    const out = scrubSentryEvent(e, defaultOpts);
    // non-object data passes through unchanged
    expect(out.breadcrumbs?.[0]?.data).toBe('raw-string');
  });
});
