/**
 * 進捗リング(02§4.3「進捗リング」)。T-101時点ではprops注入のみで実データは
 * 持たない(実データ接続はT-105、GET /api/progressのZustandキャッシュ経由)。
 */
export function ProgressRing({
  percent,
  label,
  size = 32,
}: {
  percent: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-neutral-200 dark:stroke-neutral-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="stroke-neutral-900 dark:stroke-neutral-100"
      />
    </svg>
  );
}
