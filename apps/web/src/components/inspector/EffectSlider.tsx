import { Slider } from "../ui/slider";
import { Hint } from "../Hint";
import { cn } from "../../lib/utils";

/**
 * One labelled control row.
 *
 * `value` is null when the selected clips disagree, in which case the readout
 * shows a dash until the user moves the slider and settles them all on one
 * value. Double-clicking the row returns the control to `neutral`.
 */
export function EffectSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  neutral,
  disabled = false,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  unit: string;
  neutral: number;
  disabled?: boolean;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  const display = value === null ? "—" : (format ?? ((v: number) => v.toFixed(2)))(value);

  return (
    <div
      className={cn("flex items-center gap-2 py-1", disabled && "pointer-events-none opacity-40")}
      onDoubleClick={() => onChange(neutral)}
    >
      <Hint label={hint} side="left">
        <span className="w-20 shrink-0 cursor-help text-[11px] text-muted-foreground">{label}</span>
      </Hint>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value ?? neutral]}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
      <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {display}
        {value === null ? "" : ` ${unit}`}
      </span>
    </div>
  );
}
