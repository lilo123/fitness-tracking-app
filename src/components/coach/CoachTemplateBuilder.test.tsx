import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachTemplateBuilder } from './CoachTemplateBuilder';
import { expectNoA11yViolations } from '../../test/a11y';

describe('CoachTemplateBuilder accessibility', () => {
  const defaultProps = {
    templateName: '',
    setTemplateName: vi.fn(),
    isMaster: false,
    setIsMaster: vi.fn(),
    exerciseToAdd: '',
    setExerciseToAdd: vi.fn(),
    selectedExercises: [],
    exercises: [
      { id: 'ex-1', name: 'Bench Press', body_part: 'Chest' } as any,
    ],
    templates: [],
    status: '',
    isSaving: false,
    onAddExercise: vi.fn(),
    onRemoveExercise: vi.fn(),
    onUpdateTargetSets: vi.fn(),
    onUpdateTargetReps: vi.fn(),
    onSaveTemplate: vi.fn(),
  };

  it('associates label with Template Name input', () => {
    render(<CoachTemplateBuilder {...defaultProps} />);
    expect(screen.getByLabelText(/template name/i)).toBeDefined();
  });

  it('passes axe accessibility audits with no violations', async () => {
    const { container } = render(<CoachTemplateBuilder {...defaultProps} />);
    await expectNoA11yViolations(container);
  });

  it('NEW-15: mounts live regions unconditionally and mutates text in place on status changes', () => {
    const politeOf = (c: HTMLElement) => c.querySelector('[role="status"]');
    const assertiveOf = (c: HTMLElement) => c.querySelector('[role="alert"]');

    const { container, rerender } = render(<CoachTemplateBuilder {...defaultProps} status="" />);
    const politeBefore = politeOf(container);
    const assertiveBefore = assertiveOf(container);

    expect(politeBefore).not.toBeNull();
    expect(assertiveBefore).not.toBeNull();
    expect(politeBefore!.textContent).toBe('');
    expect(assertiveBefore!.textContent).toBe('');

    // Success transition
    rerender(<CoachTemplateBuilder {...defaultProps} status="Template saved successfully!" />);
    const politeAfter = politeOf(container);
    const assertiveAfter = assertiveOf(container);

    expect(politeAfter).toBe(politeBefore);
    expect(assertiveAfter).toBe(assertiveBefore);
    expect(politeAfter!.textContent).toBe('Template saved successfully!');
    expect(assertiveAfter!.textContent).toBe('');
  });
});
