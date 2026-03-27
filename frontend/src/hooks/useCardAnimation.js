import { useEffect, useRef } from 'react'

/**
 * Observes elements with class .dash-card, .summary-card, .ilo-card
 * and adds the 'visible' class when they enter the viewport (Intersection Observer).
 */
export function useCardAnimation(deps = []) {
  const containerRef = useRef(null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const delay = e.target.dataset.delay || 0
            setTimeout(() => e.target.classList.add('visible'), +delay)
          }
        })
      },
      { threshold: 0.1 }
    )

    const root = containerRef.current || document
    root.querySelectorAll('.dash-card, .summary-card, .ilo-card').forEach(c => obs.observe(c))

    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return containerRef
}
