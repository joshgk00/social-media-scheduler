// Wave 0 RED stub for the LinkedIn live preview component (POST-LI-05).
// Plan 05a ships `<LinkedInPreview text visibility imageUrl />`.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkedInPreview } from '../components/posts/LinkedInPreview';

describe('<LinkedInPreview />', () => {
  it('renders empty placeholder when text is empty', () => {
    render(<LinkedInPreview text="" visibility="PUBLIC" />);
    expect(screen.getByText(/Type to see your post here/i)).toBeInTheDocument();
  });

  it('renders the visibility line "Anyone on LinkedIn" for PUBLIC', () => {
    render(<LinkedInPreview text="hello" visibility="PUBLIC" profileName="Test User" />);
    expect(screen.getByText(/Anyone on LinkedIn/i)).toBeInTheDocument();
  });

  it('renders the visibility line "Connections only" for CONNECTIONS', () => {
    render(<LinkedInPreview text="hello" visibility="CONNECTIONS" profileName="Test User" />);
    expect(screen.getByText(/Connections only/i)).toBeInTheDocument();
  });

  it('renders post text with whitespace-pre-wrap', () => {
    render(<LinkedInPreview text={'line1\n\nline2'} visibility="PUBLIC" />);
    const textNode = screen.getByText(/line1/);
    expect(textNode).toHaveClass(/whitespace-pre-wrap/);
  });

  it('renders single image with aspect-video class when imageUrl provided', () => {
    render(
      <LinkedInPreview
        text="hello"
        visibility="PUBLIC"
        imageUrl="https://example.com/image.jpg"
      />,
    );
    const img = screen.getByRole('img');
    expect(img.parentElement?.className ?? '').toMatch(/aspect-video/);
  });

  it('highlights spinnable text {a|b|c} with text-primary span', () => {
    render(<LinkedInPreview text="say {hi|hello|hey} there" visibility="PUBLIC" />);
    const spinnable = screen.getByText(/\{hi\|hello\|hey\}/);
    expect(spinnable.className).toMatch(/text-primary/);
  });
});
