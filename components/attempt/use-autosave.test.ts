import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from './use-autosave';
import type { Response } from '@/lib/grading';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useAutosave', () => {
  it('starts idle when nothing changes', () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useAutosave({
        attemptId: 'a',
        questionId: 'q',
        response: null,
        onSave,
      }),
    );
    expect(result.current.status).toBe('idle');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('debounces saves on response change', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const initialResponse: Response = { type: 'mc', choice_id: 'a' };
    const { result, rerender } = renderHook(
      ({ response }) =>
        useAutosave({
          attemptId: 'a',
          questionId: 'q',
          response,
          onSave,
          debounceMs: 500,
        }),
      { initialProps: { response: initialResponse } },
    );

    rerender({ response: { type: 'mc', choice_id: 'b' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      attemptId: 'a',
      questionId: 'q',
      response: { type: 'mc', choice_id: 'b' },
    });
    expect(result.current.status).toBe('saved');
  });

  it('reports error status on save failure', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: 'unknown' });
    const { result, rerender } = renderHook(
      ({ response }) =>
        useAutosave({
          attemptId: 'a',
          questionId: 'q',
          response,
          onSave,
          debounceMs: 100,
        }),
      { initialProps: { response: { type: 'mc', choice_id: 'a' } as Response } },
    );
    rerender({ response: { type: 'mc', choice_id: 'b' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(result.current.status).toBe('error');
  });
});
