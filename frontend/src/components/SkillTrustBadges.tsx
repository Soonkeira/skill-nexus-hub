import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { SkillTrustStatus } from '@/lib/types';

function badgeTone(label: string) {
  if (label.includes('安全')) return 'bg-blue-50 text-blue-700 border-blue-100';
  if (label.includes('说明')) return 'bg-teal-50 text-teal-700 border-teal-100';
  return 'bg-green-50 text-green-700 border-green-100';
}

export default function SkillTrustBadges({
  trust,
  compact = false,
}: {
  trust: SkillTrustStatus | null | undefined;
  compact?: boolean;
}) {
  if (!trust) return null;

  const labels = trust.labels || [];
  const warnings = trust.warnings || [];
  const visibleLabels = compact ? labels.slice(0, 2) : labels;
  const visibleWarnings = compact ? warnings.slice(0, labels.length ? 0 : 1) : warnings;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibleLabels.map((label) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeTone(label)}`}
        >
          {label.includes('安全') ? <ShieldCheck className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {label}
        </span>
      ))}
      {visibleWarnings.map((warning) => (
        <span
          key={warning}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
        >
          <AlertTriangle className="h-3 w-3" />
          {compact ? '需完善' : warning}
        </span>
      ))}
    </div>
  );
}
