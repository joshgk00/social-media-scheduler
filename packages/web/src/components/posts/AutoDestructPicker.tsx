import { useState, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface AutoDestructPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

function parseValue(value: string | null): { amount: number; unit: string } {
  if (!value) return { amount: 24, unit: 'hours' };
  const parts = value.split(' ');
  const amount = parseInt(parts[0], 10);
  const unit = parts[1] || 'hours';
  return { amount: isNaN(amount) ? 24 : amount, unit };
}

export function AutoDestructPicker({ value, onChange }: AutoDestructPickerProps) {
  const isEnabled = value !== null;
  const parsed = parseValue(value);
  const [amount, setAmount] = useState(parsed.amount);
  const [unit, setUnit] = useState(parsed.unit);

  useEffect(() => {
    if (value !== null) {
      const parsed = parseValue(value);
      setAmount(parsed.amount);
      setUnit(parsed.unit);
    }
  }, [value]);

  function handleToggle(checked: boolean) {
    if (checked) {
      onChange('24 hours');
    } else {
      onChange(null);
    }
  }

  function handleAmountChange(newAmount: number) {
    const clamped = Math.max(1, newAmount);
    setAmount(clamped);
    onChange(`${clamped} ${unit}`);
  }

  function handleUnitChange(newUnit: string) {
    setUnit(newUnit);
    onChange(`${amount} ${newUnit}`);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="auto-destruct"
          checked={isEnabled}
          onCheckedChange={(checked) => handleToggle(checked === true)}
        />
        <Label htmlFor="auto-destruct" className="text-sm">
          Auto-destruct
        </Label>
        {isEnabled && (
          <>
            <Input
              type="number"
              min={1}
              max={365}
              value={amount}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                handleAmountChange(isNaN(parsed) ? 1 : parsed);
              }}
              className="w-20"
              aria-label="Auto-destruct duration amount"
            />
            <Select value={unit} onValueChange={handleUnitChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">minutes</SelectItem>
                <SelectItem value="hours">hours</SelectItem>
                <SelectItem value="days">days</SelectItem>
                <SelectItem value="weeks">weeks</SelectItem>
                <SelectItem value="months">months</SelectItem>
                <SelectItem value="years">years</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Automatically delete this post from Twitter/X after the specified time. The deletion runs in the background.
      </p>
    </div>
  );
}
