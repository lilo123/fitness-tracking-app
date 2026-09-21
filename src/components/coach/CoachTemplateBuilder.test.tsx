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
});
