import { cn } from '@/lib/utils';

const GRADE_LABEL: Record<string, string> = {
  HOT: 'Hot',
  WARM: 'Warm',
  LOW: 'Low',
  ESCALATE: 'Escalate',
  NOT_ENQUIRY: 'Not an enquiry',
};

/** Colour is never the only signal — every chip carries its word. */
export function GradeChip({ grade, className }: { grade?: string | null; className?: string }) {
  if (!grade) return <span className={cn('chip fit-unknown', className)}>Ungraded</span>;
  return <span className={cn('chip', `grade-${grade}`, className)}>{GRADE_LABEL[grade] ?? grade}</span>;
}

const FIT_LABEL: Record<string, string> = {
  fits: 'Budget fits',
  close: 'Budget close',
  below: 'Budget below',
  unknown: 'Budget not stated',
};

export function FitChip({ fit, className }: { fit?: string | null; className?: string }) {
  const key = fit ?? 'unknown';
  return <span className={cn('chip', `fit-${key}`, className)}>{FIT_LABEL[key] ?? key}</span>;
}

export function Flag({ children }: { children: React.ReactNode }) {
  return <span className="chip fit-unknown">{children}</span>;
}

/** Hard rule 1: anything carrying the internal estimate says so, out loud. */
export function InternalBadge() {
  return (
    <span className="chip border-dashed" style={{ color: 'var(--ink-3)', background: 'var(--surface-2)' }}>
      internal — never share
    </span>
  );
}
