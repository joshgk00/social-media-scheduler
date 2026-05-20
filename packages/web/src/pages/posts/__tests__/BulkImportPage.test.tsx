import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BulkImportPage from '../BulkImportPage';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('../../../hooks/use-profiles', () => ({
  useProfiles: () => ({
    data: [{ id: '550e8400-e29b-41d4-a716-446655440000', handle: 'clicksmortarweb' }],
  }),
}));

vi.mock('../../../hooks/use-queues', () => ({
  useQueues: () => ({ data: [] }),
}));

vi.mock('../../../hooks/use-bulk-ops', () => ({
  useBulkImport: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

vi.mock('../../../hooks/use-csv-templates', () => ({
  getQueueTemplateUrl: () => '/queue-template.csv',
  getScheduledTemplateUrl: () => '/scheduled-template.csv',
}));

vi.mock('../../../components/bulk/FileDropZone', () => ({
  FileDropZone: ({ onFileChange }: { onFileChange: (file: File) => void }) => (
    <button type="button" onClick={() => onFileChange(new File(['bad'], 'bad-import.csv', { type: 'text/csv' }))}>
      Pick CSV
    </button>
  ),
}));

vi.mock('../../../components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const SelectContext = React.createContext<(value: string) => void>(() => undefined);

  return {
    Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (value: string) => void }) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BulkImportPage />
    </MemoryRouter>,
  );
}

describe('BulkImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rejected CSV import details inline near the import controls', async () => {
    mocks.mutateAsync.mockRejectedValue(
      Object.assign(new Error('CSV validation failed'), {
        body: {
          error: 'CSV validation failed',
          code: 'csv_validation_failed',
          errorCount: 1,
          details: [{ rowNumber: 2, reason: 'scheduled_at: Invalid datetime' }],
        },
      }),
    );

    renderPage();

    fireEvent.click(screen.getByText('@clicksmortarweb'));
    fireEvent.click(screen.getByText('Pick CSV'));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV import needs changes');
    expect(screen.getByText('Row 2: scheduled_at: Invalid datetime')).toBeInTheDocument();
  });
});
