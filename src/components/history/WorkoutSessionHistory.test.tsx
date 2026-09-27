import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkoutSessionHistory } from './WorkoutSessionHistory';
import type { HistorySession } from './useHistoryData';

describe('WorkoutSessionHistory (H4)', () => {
  const mockSessions: HistorySession[] = [
    {
      id: 'session-1',
      date: '2026-09-15T00:00:00.000Z',
      workout_date: '2026-09-15',
      civil_date: '2026-09-15',
      name: 'Leg Day',
      set_count: 5,
      total_volume: 2500,
      sets: [],
    },
  ];

  it('H4: renders formatted civil date (Sep 15) and drops raw ISO timestamp text', () => {
    render(
      <WorkoutSessionHistory
        displayedSessions={mockSessions}
        filteredSessionsCount={1}
        exercises={[]}
        timeRange="all"
        isInspectingAthlete={false}
        onEditSet={vi.fn()}
        onLoadMore={vi.fn()}
        hasMore={false}
        isLoadingMore={false}
        expandedSessionIds={new Set()}
        onToggleExpand={vi.fn()}
        loadingSessionIds={new Set()}
      />
    );

    // Formatted civil date must be displayed
    expect(screen.getByText(/Sep 15/)).toBeDefined();

    // H4: Must NOT contain raw ISO timestamp text like "(2026-09-15T00:00:00.000Z)"
    expect(screen.queryByText(/2026-09-15T00:00:00/)).toBeNull();
    expect(screen.queryByText(/\(2026-09-15/)).toBeNull();
  });
});
