import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnswerSurface } from './answer-surfaces';
import type { RenderedBody } from '@/lib/rendering';

const mcBody: RenderedBody = {
  kind: 'mc',
  choices: [
    { id: 'a', label_substituted: 'Alpha' },
    { id: 'b', label_substituted: 'Beta' },
  ],
};

describe('AnswerSurface — uncontrolled (Plan 2 preview path)', () => {
  it('renders without controlled props and tracks local state', () => {
    render(<AnswerSurface body={mcBody} />);
    const radioA = screen.getByLabelText('Alpha') as HTMLInputElement;
    fireEvent.click(radioA);
    expect(radioA.checked).toBe(true);
  });
});

describe('AnswerSurface — controlled', () => {
  it('reflects external value and calls onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AnswerSurface body={mcBody} value={{ type: 'mc', choice_id: 'a' }} onChange={onChange} />,
    );
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Beta'));
    expect(onChange).toHaveBeenCalledWith({ type: 'mc', choice_id: 'b' });

    rerender(
      <AnswerSurface body={mcBody} value={{ type: 'mc', choice_id: 'b' }} onChange={onChange} />,
    );
    expect((screen.getByLabelText('Beta') as HTMLInputElement).checked).toBe(true);
  });

  it('disabled prop disables inputs', () => {
    render(
      <AnswerSurface
        body={mcBody}
        value={{ type: 'mc', choice_id: 'a' }}
        onChange={() => {}}
        disabled
      />,
    );
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).disabled).toBe(true);
  });
});
