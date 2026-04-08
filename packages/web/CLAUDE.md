# Web Package Standards

## Accessibility

- Every page: `<main>` landmark wrapping primary content (WCAG 1.3.1)
- Semantic elements (`<nav>`, `<header>`, `<footer>`, `<section>`) before `<div>`
- Interactive elements: accessible names via visible text or `aria-label`
- Color contrast: WCAG AA (4.5:1 normal, 3:1 large)
- All inputs: associated `<label>`

## Component Structure

- Page components wrap content in `<main>`
- Layout components use semantic HTML (`Header` → `<header>`)
- Shared UI: `src/components/ui/`. Page-specific: `src/pages/<page>/components/`

## Naming

- `queryClient` not `qc`. Hook results include domain noun: `securityQuestionsStatus` not `sqStatus`
- Time vars: `minutes`, `remainingSeconds` — never `m`, `s`
- State functions: semantic names (`resetToEmailStep` not `resetToStep1`)
- Descriptive loop indices when multiple in scope
- Collapse single-use intermediates when inline is clear

## Code Quality

- ESLint suppressions require WHY comment: `// eslint-disable-line exhaustive-deps -- reset on every change would loop`
- Redirect URLs from query params: only relative paths starting with `/` not `//`

## State Management

- Server state: TanStack Query
- Client UI state: Zustand
- Form state: React Hook Form + Zod resolvers
