import styles from "./index.module.css";

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}

export const Slider = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  className = "",
}: SliderProps) => {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      className={[styles.track, className].filter(Boolean).join(" ")}
      style={{ "--fill": `${pct}%` } as React.CSSProperties}
    >
      <input
        type="range"
        className={styles.input}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
};
