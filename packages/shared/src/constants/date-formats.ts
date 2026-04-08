export const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: '04/07/2026' },
  { value: 'DD/MM/YYYY', label: '07/04/2026' },
  { value: 'YYYY-MM-DD', label: '2026-04-07' },
  { value: 'MMM D, YYYY', label: 'Apr 7, 2026' },
  { value: 'D MMM YYYY', label: '7 Apr 2026' },
  { value: 'MMMM D, YYYY', label: 'April 7, 2026' },
  { value: 'D MMMM YYYY', label: '7 April 2026' },
  { value: 'DD.MM.YYYY', label: '07.04.2026' },
] as const;

export const ENTRIES_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
