// components/Hairline.tsx — the 1px divider primitive (Lane B).
// Hierarchy in Vellum comes from hairlines, never shadows. Radius 0.

import { clsx } from 'clsx';

interface HairlineProps {
  orientation?: 'horizontal' | 'vertical';
  strong?: boolean;
  className?: string;
}

export function Hairline({
  orientation = 'horizontal',
  strong = false,
  className,
}: HairlineProps) {
  const color = strong ? 'bg-hairline-hi' : 'bg-hairline';
  return (
    <div
      aria-hidden
      className={clsx(
        color,
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
    />
  );
}
