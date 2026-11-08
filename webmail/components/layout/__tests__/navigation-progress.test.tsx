import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationProgress } from '@/components/layout/navigation-progress';

// The top loading bar: hidden at rest, up the moment an internal navigation
// begins, and down again once the new page paints. It must ignore the clicks
// and history calls that are not real page changes, and it must hand history
// back untouched when it unmounts.

const nav = vi.hoisted(() => ({ pathname: '/en/mail' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

function bar(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-navigation-progress]');
  if (!el) throw new Error('progress bar not rendered');
  return el as HTMLElement;
}

function inner(container: HTMLElement): HTMLElement {
  return bar(container).firstElementChild as HTMLElement;
}

function renderWithAnchor(href: string) {
  return render(
    <div>
      <NavigationProgress />
      <a href={href}>go</a>
    </div>,
  );
}

beforeEach(() => {
  nav.pathname = '/en/mail';
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-motion');
  window.history.replaceState(null, '', '/');
});

describe('NavigationProgress', () => {
  it('renders hidden and aria-hidden, and stays hidden on mount', () => {
    const { container } = render(<NavigationProgress />);
    expect(bar(container).getAttribute('aria-hidden')).toBe('true');
    expect(bar(container).style.opacity).toBe('0');
    act(() => vi.advanceTimersByTime(1000));
    expect(bar(container).style.opacity).toBe('0');
  });

  it('starts on a click into an internal same-origin anchor', () => {
    const { container, getByText } = renderWithAnchor(`${window.location.origin}/en/calendar`);
    fireEvent.click(getByText('go'));
    expect(bar(container).style.opacity).toBe('1');
    expect(inner(container).style.width).toBe('8%');
  });

  it('ignores an external anchor', () => {
    const { container, getByText } = renderWithAnchor('https://example.com/elsewhere');
    fireEvent.click(getByText('go'));
    expect(bar(container).style.opacity).toBe('0');
  });

  it('ignores a modifier-click (opens in a new tab)', () => {
    const { container, getByText } = renderWithAnchor(`${window.location.origin}/en/calendar`);
    fireEvent.click(getByText('go'), { metaKey: true });
    expect(bar(container).style.opacity).toBe('0');
  });

  it('ignores a click that lands on the current URL', () => {
    const { container, getByText } = renderWithAnchor(`${window.location.origin}/`);
    fireEvent.click(getByText('go'));
    expect(bar(container).style.opacity).toBe('0');
  });

  it('starts on a history.pushState page switch, then completes and hides', () => {
    const { container } = render(<NavigationProgress />);
    act(() => {
      window.history.pushState(null, '', '/en/admin/domains');
    });
    expect(bar(container).style.opacity).toBe('1');
    act(() => vi.advanceTimersByTime(300));
    expect(inner(container).style.width).toBe('100%');
    act(() => vi.advanceTimersByTime(240));
    expect(bar(container).style.opacity).toBe('0');
  });

  it('ignores a pushState that does not change the URL', () => {
    const { container } = render(<NavigationProgress />);
    act(() => {
      window.history.pushState(null, '', '/');
    });
    expect(bar(container).style.opacity).toBe('0');
  });

  it('completes when the pathname changes mid-navigation', () => {
    const view = renderWithAnchor(`${window.location.origin}/en/calendar`);
    fireEvent.click(view.getByText('go'));
    expect(bar(view.container).style.opacity).toBe('1');
    act(() => {
      nav.pathname = '/en/calendar';
      view.rerender(
        <div>
          <NavigationProgress />
          <a href={`${window.location.origin}/en/calendar`}>go</a>
        </div>,
      );
    });
    act(() => vi.advanceTimersByTime(300 + 240));
    expect(bar(view.container).style.opacity).toBe('0');
  });

  it('holds a static width instead of trickling under reduced motion', () => {
    document.documentElement.setAttribute('data-motion', 'reduce');
    const { container, getByText } = renderWithAnchor(`${window.location.origin}/en/calendar`);
    fireEvent.click(getByText('go'));
    expect(inner(container).style.width).toBe('40%');
    act(() => vi.advanceTimersByTime(1000));
    expect(inner(container).style.width).toBe('40%');
  });

  it('restores the original history methods on unmount', () => {
    const nativePush = window.history.pushState;
    const nativeReplace = window.history.replaceState;
    const { unmount } = render(<NavigationProgress />);
    expect(window.history.pushState).not.toBe(nativePush);
    expect(window.history.replaceState).not.toBe(nativeReplace);
    unmount();
    expect(window.history.pushState).toBe(nativePush);
    expect(window.history.replaceState).toBe(nativeReplace);
  });
});