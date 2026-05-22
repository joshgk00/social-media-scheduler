import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/sonner';
import { queryClient } from './lib/query-client';
import { BULK_OPERATION_LIVE_REGION_ID } from './lib/bulk-operation-live-region';
import { initializeTheme } from './lib/theme';
import { App } from './App';
import './index.css';

initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <div id={BULK_OPERATION_LIVE_REGION_ID} role="status" aria-live="polite" className="sr-only" />
      <Toaster position="bottom-right" richColors closeButton duration={5000} />
    </QueryClientProvider>
  </StrictMode>,
);
