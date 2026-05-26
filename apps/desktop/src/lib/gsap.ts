import gsap from 'gsap';

export function fadeInUp(
  targets: gsap.TweenTarget,
  options?: { delay?: number; stagger?: number; duration?: number },
): gsap.core.Tween {
  return gsap.fromTo(
    targets,
    { opacity: 0, y: 24 },
    {
      opacity: 1,
      y: 0,
      duration: options?.duration ?? 0.6,
      delay: options?.delay ?? 0,
      stagger: options?.stagger ?? 0.08,
      ease: 'power3.out',
    },
  );
}

export function pageTransition(container: HTMLElement | null): gsap.core.Timeline | null {
  if (!container) return null;
  const tl = gsap.timeline();
  tl.fromTo(
    container,
    { opacity: 0, y: 12, scale: 0.99 },
    { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out' },
  );
  return tl;
}

export function pulseGlow(el: HTMLElement | null): gsap.core.Tween | null {
  if (!el) return null;
  return gsap.to(el, {
    boxShadow: '0 0 24px rgba(249, 115, 22, 0.35)',
    duration: 1.2,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
  });
}

export function staggerCards(
  targets: gsap.TweenTarget,
  options?: { delay?: number; stagger?: number },
): gsap.core.Tween {
  return gsap.fromTo(
    targets,
    { opacity: 0, y: 20, scale: 0.96 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.5,
      delay: options?.delay ?? 0,
      stagger: options?.stagger ?? 0.06,
      ease: 'power3.out',
    },
  );
}

export function panelSlide(
  el: HTMLElement | null,
  direction: 'in' | 'out' = 'in',
): gsap.core.Tween | null {
  if (!el) return null;
  return gsap.fromTo(
    el,
    { opacity: direction === 'in' ? 0 : 1, x: direction === 'in' ? 16 : 0 },
    {
      opacity: direction === 'in' ? 1 : 0,
      x: direction === 'in' ? 0 : 16,
      duration: 0.35,
      ease: 'power2.out',
    },
  );
}
