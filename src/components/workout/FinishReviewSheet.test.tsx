import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FinishReviewSheet, type PendingReviewSet } from './FinishReviewSheet';

describe('FinishReviewSheet (W18, STD-CMP-1/4/7)', () => {
  const mockPendingSets: PendingReviewSet[] = [
    { exerciseName: 'Bench Press', weight: 185, reps: 8, setIndex: 2 },
    { exerciseName: 'Bench Press', weight: 185, reps: 8, setIndex: 3 },
    { exerciseName: 'Squat', weight: 225, reps: 5, setIndex: 1 },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    pendingSets: mockPendingSets,
    onConfirmFinishWithSets: vi.fn(),
    onFinishWithoutSets: vi.fn(),
    isSubmitting: false,
  };

  it('renders all pending sets with initial values', () => {
    render(<FinishReviewSheet {...defaultProps} />);

    expect(screen.getByText('Review Pending Sets')).toBeDefined();
    expect(screen.getByText(/Review the 3 pending set\(s\)/i)).toBeDefined();
    expect(screen.getAllByText('Bench Press')).toHaveLength(2);
    expect(screen.getByText('Squat')).toBeDefined();

    expect(screen.getByTestId('finish-review-weight-0')).toHaveValue('185');
    expect(screen.getByTestId('finish-review-reps-0')).toHaveValue('8');

    expect(screen.getByTestId('log-reviewed-sets-btn')).toHaveTextContent('Log 3 sets & finish');
  });

  it('allows editing weight and reps of pending sets', () => {
    const onConfirmFinishWithSets = vi.fn();
    render(<FinishReviewSheet {...defaultProps} onConfirmFinishWithSets={onConfirmFinishWithSets} />);

    const weightInput = screen.getByTestId('finish-review-weight-0');
    fireEvent.change(weightInput, { target: { value: '195' } });
    expect(weightInput).toHaveValue('195');

    const repsInput = screen.getByTestId('finish-review-reps-0');
    fireEvent.change(repsInput, { target: { value: '10' } });
    expect(repsInput).toHaveValue('10');

    fireEvent.click(screen.getByTestId('log-reviewed-sets-btn'));
    expect(onConfirmFinishWithSets).toHaveBeenCalledWith([
      { exerciseName: 'Bench Press', weight: 195, reps: 10, setIndex: 2 },
      { exerciseName: 'Bench Press', weight: 185, reps: 8, setIndex: 3 },
      { exerciseName: 'Squat', weight: 225, reps: 5, setIndex: 1 },
    ]);
  });

  it('allows removing a pending set', () => {
    const onConfirmFinishWithSets = vi.fn();
    render(<FinishReviewSheet {...defaultProps} onConfirmFinishWithSets={onConfirmFinishWithSets} />);

    fireEvent.click(screen.getByTestId('finish-review-remove-1'));

    expect(screen.getByTestId('log-reviewed-sets-btn')).toHaveTextContent('Log 2 sets & finish');

    fireEvent.click(screen.getByTestId('log-reviewed-sets-btn'));
    expect(onConfirmFinishWithSets).toHaveBeenCalledWith([
      { exerciseName: 'Bench Press', weight: 185, reps: 8, setIndex: 2 },
      { exerciseName: 'Squat', weight: 225, reps: 5, setIndex: 1 },
    ]);
  });

  it('clicking "Finish without them" calls onFinishWithoutSets', () => {
    const onFinishWithoutSets = vi.fn();
    render(<FinishReviewSheet {...defaultProps} onFinishWithoutSets={onFinishWithoutSets} />);

    fireEvent.click(screen.getByTestId('finish-without-sets-btn'));
    expect(onFinishWithoutSets).toHaveBeenCalledTimes(1);
  });
});
