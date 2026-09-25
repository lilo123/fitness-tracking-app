import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MacroRing } from './MacroRing';

describe('MacroRing reduced motion accessibility', () => {
  it('applies motion-reduce:transition-none to progress circle transition (F9)', () => {
    const { container } = render(
      <MacroRing
        label="Calories"
        current={1200}
        target={2000}
        unit="kcal"
        colorClass="text-amber-400"
        strokeColor="#f59e0b"
      />
    );

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    const progressCircle = circles[1];

    expect(progressCircle.getAttribute('class')).toContain('duration-700');
    expect(progressCircle.getAttribute('class')).toContain('motion-reduce:transition-none');
  });
});
