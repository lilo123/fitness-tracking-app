import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExercisePickerSheet } from './ExercisePickerSheet';

describe('ExercisePickerSheet', () => {
  const mockProps = {
    filteredExercises: [],
    totalExercisesCount: 0,
    templateExercisesCount: 0,
    searchQuery: '',
    onSearchQueryChange: vi.fn(),
    selectedCategory: 'All',
    onSelectedCategoryChange: vi.fn(),
    onAddExercise: vi.fn(),
    onClose: vi.fn(),
  };

  it('applies input-text-xs to prevent iOS zoom while preserving pl-9 padding', () => {
    render(<ExercisePickerSheet {...mockProps} />);
    const input = screen.getByPlaceholderText(/search exercise library/i);
    expect(input.classList.contains('input-text-xs')).toBe(true);
    expect(input.classList.contains('pl-9')).toBe(true);
    expect(input.classList.contains('text-xs')).toBe(false);
  });
});
