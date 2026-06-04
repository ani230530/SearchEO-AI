import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type UseScrollSpyBreadcrumbsOptions = {
  scrollRootRef?: RefObject<HTMLElement | null>;
  rootMargin?: string;
};

type BreadcrumbTrail = {
  currentTitle: string | null;
  previousTitle: string | null;
};

const DEFAULT_ROOT_MARGIN = '-25% 0px -70% 0px';

export function useScrollSpyBreadcrumbs({
  scrollRootRef,
  rootMargin = DEFAULT_ROOT_MARGIN,
}: UseScrollSpyBreadcrumbsOptions = {}) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const refreshRafRef = useRef<number | null>(null);
  const scrollRootRefSnapshot = useRef<HTMLElement | null>(null);
  const trailRef = useRef<BreadcrumbTrail>({
    currentTitle: null,
    previousTitle: null,
  });
  const [trail, setTrail] = useState<BreadcrumbTrail>({
    currentTitle: null,
    previousTitle: null,
  });

  const applyActiveTitle = useCallback((nextTitle: string | null) => {
    if (!nextTitle) {
      return;
    }

    setTrail((current) => {
      if (current.currentTitle === nextTitle) {
        return current;
      }

      const nextTrail = {
        previousTitle: current.currentTitle,
        currentTitle: nextTitle,
      };
      trailRef.current = nextTrail;
      return nextTrail;
    });
  }, []);

  const updateFromPositions = useCallback(() => {
    const root = scrollRootRefSnapshot.current;
    const nodes = Array.from((root ?? document).querySelectorAll<HTMLElement>('[data-title]')).filter((node) => {
      const title = node.dataset.title?.trim();
      return Boolean(title);
    });

    if (!nodes.length) {
      const emptyTrail = { currentTitle: null, previousTitle: null };
      trailRef.current = emptyTrail;
      setTrail(emptyTrail);
      return;
    }

    const rootRect = root?.getBoundingClientRect() ?? null;
    const focusY = rootRect
      ? rootRect.top + rootRect.height * 0.3
      : window.innerHeight * 0.3;

    let currentTitle = nodes[0]?.dataset.title?.trim() ?? null;
    let previousTitle: string | null = null;

    for (const node of nodes) {
      const title = node.dataset.title?.trim() ?? null;
      if (!title) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      if (rect.top <= focusY) {
        previousTitle = currentTitle;
        currentTitle = title;
      } else {
        break;
      }
    }

    const nextTrail = { currentTitle, previousTitle };
    const current = trailRef.current;
    if (current.currentTitle !== nextTrail.currentTitle || current.previousTitle !== nextTrail.previousTitle) {
      trailRef.current = nextTrail;
      setTrail(nextTrail);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const root = scrollRootRef?.current ?? null;
    scrollRootRefSnapshot.current = root;
    const observedRoot = root && root.scrollHeight > root.clientHeight + 1 ? root : null;
    const container: ParentNode = observedRoot ?? document;
    const eventTarget: Window | HTMLElement = observedRoot ?? window;

    const refresh = () => {
      observerRef.current?.disconnect();

      const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-title]')).filter((node) => {
        const title = node.dataset.title?.trim();
        return Boolean(title);
      });

      if (!nodes.length) {
        trailRef.current = { currentTitle: null, previousTitle: null };
        setTrail(trailRef.current);
        return;
      }

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const visibleEntries = entries
            .filter((entry) => entry.isIntersecting)
            .sort((left, right) => {
              const ratioDelta = right.intersectionRatio - left.intersectionRatio;
              if (Math.abs(ratioDelta) > 0.001) {
                return ratioDelta;
              }

              return left.boundingClientRect.top - right.boundingClientRect.top;
            });

          const topEntry = visibleEntries[0];
          const nextTitle = topEntry?.target instanceof HTMLElement
            ? topEntry.target.dataset.title?.trim() ?? null
            : null;

          applyActiveTitle(nextTitle);
          updateFromPositions();
        },
        {
          root: observedRoot,
          rootMargin,
          threshold: [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1],
        }
      );

      for (const node of nodes) {
        observerRef.current.observe(node);
      }

      updateFromPositions();
    };

    const scheduleRefresh = () => {
      if (refreshRafRef.current != null) {
        return;
      }

      refreshRafRef.current = window.requestAnimationFrame(() => {
        refreshRafRef.current = null;
        refresh();
      });
    };

    refresh();

    mutationObserverRef.current = new MutationObserver(() => {
      scheduleRefresh();
    });

    mutationObserverRef.current.observe(observedRoot ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-title'],
    });

    eventTarget.addEventListener('scroll', scheduleRefresh, { passive: true });
    window.addEventListener('resize', scheduleRefresh, { passive: true });

    return () => {
      observerRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
      eventTarget.removeEventListener('scroll', scheduleRefresh);
      window.removeEventListener('resize', scheduleRefresh);
      if (refreshRafRef.current != null) {
        window.cancelAnimationFrame(refreshRafRef.current);
        refreshRafRef.current = null;
      }
    };
  }, [applyActiveTitle, rootMargin, scrollRootRef, updateFromPositions]);

  return {
    currentTitle: trail.currentTitle,
    previousTitle: trail.previousTitle,
  };
}
