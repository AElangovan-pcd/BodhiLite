import crypto from 'node:crypto';
import type { Event } from '@sentry/nextjs';

export type ScrubOptions = {
  hmacKey: string;
};

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const SCRUB_HEADER_KEYS = /^(authorization|cookie|x-supabase-.*)$/i;
const BODY_KEYS = new Set(['body', 'requestBody', 'responseBody']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hmac12(value: string, key: string): string {
  return crypto.createHmac('sha256', key).update(value).digest('hex').slice(0, 12);
}

function scrubRecursive(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return EMAIL_REGEX.test(value) ? '[scrubbed-email]' : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => scrubRecursive(v, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = scrubRecursive(v, seen);
    }
    return out;
  }
  return value;
}

function scrubRequestHeaders(headers: unknown): unknown {
  if (!isPlainObject(headers)) return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SCRUB_HEADER_KEYS.test(k) ? '[scrubbed]' : v;
  }
  return out;
}

function scrubBreadcrumbData(data: unknown, seen: WeakSet<object>): unknown {
  if (!isPlainObject(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (BODY_KEYS.has(k)) {
      out[k] = '[scrubbed]';
    } else {
      out[k] = scrubRecursive(v, seen);
    }
  }
  return out;
}

export function scrubSentryEvent(event: Event, opts: ScrubOptions): Event {
  const seen = new WeakSet<object>();
  // Use a plain object so exactOptionalPropertyTypes doesn't block field writes;
  // cast back to Event at return.
  const out = { ...event } as Record<string, unknown>;

  if (isPlainObject(event.request)) {
    const req = event.request as Record<string, unknown>;
    const newReq: Record<string, unknown> = { ...req };
    if ('data' in newReq) newReq.data = '[scrubbed]';
    if ('query_string' in newReq) newReq.query_string = '[scrubbed]';
    if ('cookies' in newReq) delete newReq.cookies;
    if ('headers' in newReq) newReq.headers = scrubRequestHeaders(newReq.headers);
    out.request = newReq;
  }

  if (event.user) {
    const u: Record<string, unknown> = { ...event.user };
    delete u.email;
    delete u.username;
    delete u.ip_address;
    if (typeof u.id === 'string' && u.id.length > 0) {
      u.id = hmac12(u.id, opts.hmacKey);
    }
    out.user = u;
  }

  if (event.extra) {
    out.extra = scrubRecursive(event.extra, seen);
  }

  if (event.contexts) {
    out.contexts = scrubRecursive(event.contexts, seen);
  }

  if (Array.isArray(event.breadcrumbs)) {
    out.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      data: scrubBreadcrumbData(bc.data, seen),
    }));
  }

  return out as Event;
}
