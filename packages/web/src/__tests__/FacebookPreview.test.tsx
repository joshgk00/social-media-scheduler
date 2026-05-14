// Wave 0 RED stub for the Facebook live preview component (POST-FB-06).
// Plan 05a ships `<FacebookPreview text imageUrls linkUrl videoUrl />`.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FacebookPreview } from '../components/posts/FacebookPreview';

describe('<FacebookPreview />', () => {
  it('renders empty placeholder when nothing entered', () => {
    render(<FacebookPreview text="" imageUrls={[]} linkUrl={null} videoUrl={null} />);
    expect(screen.getByText(/Type to see your post here/i)).toBeInTheDocument();
  });

  it('renders single image full-width when one image provided', () => {
    render(
      <FacebookPreview
        text="hello"
        imageUrls={['https://example.com/1.jpg']}
        linkUrl={null}
        videoUrl={null}
      />,
    );
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
  });

  it('renders 3 images as asymmetric grid (left full-height + two stacked right)', () => {
    render(
      <FacebookPreview
        text="hi"
        imageUrls={[
          'https://example.com/1.jpg',
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
        ]}
        linkUrl={null}
        videoUrl={null}
      />,
    );
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    // The container layout uses a 3-image asymmetric grid pattern.
    expect(images[0].closest('[data-fb-grid="3"]')).not.toBeNull();
  });

  it('renders 4 images as 2x2 grid', () => {
    render(
      <FacebookPreview
        text="hi"
        imageUrls={[
          'https://example.com/1.jpg',
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
          'https://example.com/4.jpg',
        ]}
        linkUrl={null}
        videoUrl={null}
      />,
    );
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(4);
    expect(images[0].closest('[data-fb-grid="4"]')).not.toBeNull();
  });

  it('renders 8 images as 3-col grid with first 6 visible and "+2" overlay on last cell', () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://example.com/${i + 1}.jpg`);
    render(
      <FacebookPreview text="hi" imageUrls={urls} linkUrl={null} videoUrl={null} />,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders linkUrl as plain text in text-primary, not as anchor (D-10)', () => {
    render(
      <FacebookPreview
        text="check this"
        imageUrls={[]}
        linkUrl="https://example.com/article"
        videoUrl={null}
      />,
    );
    // The linkUrl preview must NOT be a clickable anchor — Facebook renders
    // a card, but the preview shows it inline as text-primary.
    const linkText = screen.getByText(/example.com\/article/i);
    expect(linkText.tagName).not.toBe('A');
    expect(linkText.className).toMatch(/text-primary/);
  });

  it('renders video as aspect-video placeholder with Play icon', () => {
    render(
      <FacebookPreview
        text="watch"
        imageUrls={[]}
        linkUrl={null}
        videoUrl="https://example.com/video.mp4"
      />,
    );
    const playIcon = screen.getByLabelText(/play/i);
    expect(playIcon).toBeInTheDocument();
    expect(playIcon.parentElement?.className ?? '').toMatch(/aspect-video/);
  });
});
