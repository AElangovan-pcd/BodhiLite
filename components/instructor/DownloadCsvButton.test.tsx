import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DownloadCsvButton } from './DownloadCsvButton';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const originalFetch = global.fetch;
const originalCreateObjectURL = global.URL.createObjectURL;
const originalRevokeObjectURL = global.URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  global.URL.createObjectURL = originalCreateObjectURL;
  global.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('<DownloadCsvButton>', () => {
  it('renders with accessible label', () => {
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz 1" />);
    expect(
      screen.getByRole('button', { name: /download gradebook csv for quiz 1/i }),
    ).toBeInTheDocument();
  });

  it('triggers download on click when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Student,SIS User ID,SIS Login ID,Quiz\na@b.com,,a@b.com,50.00\n', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="quiz-2026-05-26.csv"' },
      }),
    );
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    const button = screen.getByRole('button', { name: /download/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/gradebook/a-1/csv');
    });
    await waitFor(() => {
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('disables the button while a fetch is in flight', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolveFetch = r)));
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    const button = screen.getByRole('button', { name: /download/i });

    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveFetch(new Response('header\n', { status: 200 }));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('toasts error on non-200', async () => {
    const { toast } = await import('sonner');
    global.fetch = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 }));
    render(<DownloadCsvButton assessmentId="a-1" assessmentTitle="Quiz" />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
