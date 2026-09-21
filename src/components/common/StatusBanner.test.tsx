import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusBanner } from './StatusBanner';
import { expectNoA11yViolations } from '../../test/a11y';

/**
 * The whole point of `StatusBanner` is that its live regions are mounted
 * before the message arrives. A test that only checks "the text shows up"
 * would pass just as happily against the broken `{error && <div role="alert">}`
 * idiom, so it would be worthless as a regression guard.
 *
 * The load-bearing test here is "keeps the same live region DOM nodes across
 * the idle -> message transition". That is the property assistive technology
 * actually depends on, and it is the one that fails if someone later
 * "simplifies" this component back into a conditional render.
 */
describe('StatusBanner', () => {
  const politeOf = (c: HTMLElement) => c.querySelector('[role="status"]');
  const assertiveOf = (c: HTMLElement) => c.querySelector('[role="alert"]');

  it('mounts both live regions, empty, while idle', () => {
    const { container } = render(<StatusBanner message={null} />);

    const polite = politeOf(container);
    const assertive = assertiveOf(container);

    // Present...
    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    // ...and silent.
    expect(polite!.textContent).toBe('');
    expect(assertive!.textContent).toBe('');
    // Nothing visible to a sighted user.
    expect(container.textContent).toBe('');
  });

  it('keeps the same live region DOM nodes across the idle -> message transition', () => {
    const { container, rerender } = render(<StatusBanner message={null} tone="error" />);

    const politeBefore = politeOf(container);
    const assertiveBefore = assertiveOf(container);

    rerender(<StatusBanner message="Failed to save" tone="error" />);

    const politeAfter = politeOf(container);
    const assertiveAfter = assertiveOf(container);

    // Node *identity*, not just presence. If these are different objects React
    // tore the region down and rebuilt it, which is exactly the conditional
    // mount bug -- screen readers would announce nothing.
    expect(politeAfter).toBe(politeBefore);
    expect(assertiveAfter).toBe(assertiveBefore);

    // And the content mutated in place, which is what AT listens for.
    expect(assertiveAfter!.textContent).toBe('Failed to save');
  });

  it('routes errors to the assertive region and leaves the polite one silent', () => {
    const { container } = render(<StatusBanner message="Could not reach server" tone="error" />);

    expect(assertiveOf(container)!.textContent).toBe('Could not reach server');
    expect(politeOf(container)!.textContent).toBe('');
  });

  it('routes success and info to the polite region and leaves the assertive one silent', () => {
    const { container, rerender } = render(<StatusBanner message="Settings saved" tone="success" />);

    expect(politeOf(container)!.textContent).toBe('Settings saved');
    expect(assertiveOf(container)!.textContent).toBe('');

    rerender(<StatusBanner message="Cooldown ends at 14:05" tone="info" />);

    expect(politeOf(container)!.textContent).toBe('Cooldown ends at 14:05');
    expect(assertiveOf(container)!.textContent).toBe('');
  });

  it('announces the message exactly once -- the visible banner is not itself a live region', () => {
    const { container } = render(
      <StatusBanner message="Saved" tone="success" testId="my-banner" />
    );

    const visible = container.querySelector('[data-testid="my-banner"]')!;
    expect(visible.textContent).toContain('Saved');

    // The visible copy must carry no live-region semantics of its own, or the
    // message gets spoken twice.
    expect(visible.getAttribute('role')).toBeNull();
    expect(visible.getAttribute('aria-live')).toBeNull();

    // Exactly one region holds the text.
    const speaking = [politeOf(container), assertiveOf(container)].filter(
      (r) => r!.textContent !== ''
    );
    expect(speaking).toHaveLength(1);
  });

  it('goes silent again when the message clears, without unmounting the regions', () => {
    const { container, rerender } = render(<StatusBanner message="Saved" tone="success" />);
    const politeBefore = politeOf(container);

    rerender(<StatusBanner message={null} tone="success" />);

    expect(politeOf(container)).toBe(politeBefore);
    expect(politeOf(container)!.textContent).toBe('');
    expect(container.querySelector('[data-testid]')).toBeNull();
  });

  it('has no axe violations while idle or while showing an error', async () => {
    const idle = render(<StatusBanner message={null} />);
    await expectNoA11yViolations(idle.container);
    idle.unmount();

    const erroring = render(<StatusBanner message="Something broke" tone="error" testId="b" />);
    await expectNoA11yViolations(erroring.container);
  });
});
