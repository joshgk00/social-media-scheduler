import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

interface VisibilitySelectorProps {
  value: 'PUBLIC' | 'CONNECTIONS';
  onValueChange: (value: 'PUBLIC' | 'CONNECTIONS') => void;
  disabled?: boolean;
}

/**
 * LinkedIn share visibility selector (POST-LI-03).
 *
 * Two stacked radio rows with the exact UI-SPEC copy:
 *   - "Anyone on LinkedIn" — visible to anyone, including non-members
 *   - "Connections only"   — visible only to direct connections
 *
 * The Radix `RadioGroup` provides keyboard arrow-key navigation between
 * options for free, satisfying the a11y test in the Plan 01 stub.
 */
export function VisibilitySelector({ value, onValueChange, disabled }: VisibilitySelectorProps) {
  return (
    <fieldset className="space-y-2" {...(disabled ? { disabled: true } : {})}>
      <legend id="visibility-heading" className="text-sm font-semibold mb-2">
        Visibility
      </legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onValueChange(next as 'PUBLIC' | 'CONNECTIONS')}
        aria-labelledby="visibility-heading"
        className="gap-2"
      >
        <div
          className="flex items-start gap-3 rounded-md border p-3 hover:bg-secondary/50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
          data-state={value === 'PUBLIC' ? 'checked' : 'unchecked'}
        >
          <RadioGroupItem
            value="PUBLIC"
            id="vis-public"
            className="mt-0.5"
            aria-label="Anyone on LinkedIn"
          />
          <Label htmlFor="vis-public" className="flex flex-col gap-0.5 cursor-pointer">
            <span className="text-sm font-semibold">Anyone on LinkedIn</span>
            <span className="text-xs text-muted-foreground font-normal">
              Visible to anyone, including non-members.
            </span>
          </Label>
        </div>
        <div
          className="flex items-start gap-3 rounded-md border p-3 hover:bg-secondary/50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
          data-state={value === 'CONNECTIONS' ? 'checked' : 'unchecked'}
        >
          <RadioGroupItem
            value="CONNECTIONS"
            id="vis-connections"
            className="mt-0.5"
            aria-label="Connections only"
          />
          <Label htmlFor="vis-connections" className="flex flex-col gap-0.5 cursor-pointer">
            <span className="text-sm font-semibold">Connections only</span>
            <span className="text-xs text-muted-foreground font-normal">
              Visible to your direct connections.
            </span>
          </Label>
        </div>
      </RadioGroup>
    </fieldset>
  );
}
