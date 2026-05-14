import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueStatusBadge } from '../../components/queues/QueueStatusBadge';

vi.mock('lucide-react', () => ({
  Clock: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
});

const defaultProps = { isPaused: false, postCount: 5 };

describe('QueueStatusBadge', () => {
  describe('same-year window (Apr-Oct)', () => {
    const seasonalProps = { seasonalStart: '04-01', seasonalEnd: '10-31' };

    it('shows Active during seasonal window (July 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Seasonal pause')).toBeNull();
    });

    it('shows Seasonal pause outside window (Feb 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });

    it('shows Active on exact start date (Apr 1)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.queryByText('Seasonal pause')).toBeNull();
      expect(screen.getByText('Active')).toBeTruthy();
    });

    it('shows Active on exact end date (Oct 31)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.queryByText('Seasonal pause')).toBeNull();
      expect(screen.getByText('Active')).toBeTruthy();
    });

    it('shows Seasonal pause day after end (Nov 1)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });

    it('shows Seasonal pause day before start (Mar 31)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });
  });

  describe('cross-year window (Nov-Jan)', () => {
    const seasonalProps = { seasonalStart: '11-01', seasonalEnd: '01-31' };

    it('shows Active during Nov (Nov 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Seasonal pause')).toBeNull();
    });

    it('shows Active during Dec (Dec 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Seasonal pause')).toBeNull();
    });

    it('shows Active during Jan (Jan 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Seasonal pause')).toBeNull();
    });

    it('shows Seasonal pause during Feb (Feb 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });

    it('shows Seasonal pause during Jul (Jul 15)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });

    it('shows Active on exact start date (Nov 1)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.queryByText('Seasonal pause')).toBeNull();
      expect(screen.getByText('Active')).toBeTruthy();
    });

    it('shows Active on exact end date (Jan 31)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.queryByText('Seasonal pause')).toBeNull();
      expect(screen.getByText('Active')).toBeTruthy();
    });

    it('shows Seasonal pause day after end (Feb 1)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });

    it('shows Seasonal pause day before start (Oct 31)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} {...seasonalProps} />);
      expect(screen.getByText('Seasonal pause')).toBeTruthy();
    });
  });

  describe('no seasonal window', () => {
    it('shows Active when no seasonal window configured', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      render(<QueueStatusBadge {...defaultProps} seasonalStart={null} seasonalEnd={null} />);
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.queryByText('Seasonal pause')).toBeNull();
    });
  });

  describe('other badge states', () => {
    it('shows Paused when isPaused=true', () => {
      render(<QueueStatusBadge isPaused postCount={5} />);
      expect(screen.getByText('Paused')).toBeTruthy();
    });

    it('shows Empty when postCount=0', () => {
      render(<QueueStatusBadge isPaused={false} postCount={0} />);
      expect(screen.getByText('Empty')).toBeTruthy();
    });
  });
});
