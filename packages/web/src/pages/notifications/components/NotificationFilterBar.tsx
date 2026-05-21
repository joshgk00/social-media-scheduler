import { NativeSelect } from '@/components/ui/native-select';
import { Segmented } from '@/components/ui/segmented';

export interface NotificationFilterBarProps {
  readStatus: 'all' | 'read' | 'unread';
  type: 'all' | 'error' | 'warning' | 'info';
  onReadStatusChange: (readStatus: 'all' | 'read' | 'unread') => void;
  onTypeChange: (type: 'all' | 'error' | 'warning' | 'info') => void;
}

export function NotificationFilterBar({
  readStatus,
  type,
  onReadStatusChange,
  onTypeChange,
}: NotificationFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Segmented
        label="Notification read status"
        value={readStatus}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread' },
          { value: 'read', label: 'Read' },
        ]}
        onChange={onReadStatusChange}
      />
      <NativeSelect
        label="Type"
        value={type}
        onChange={(event) => onTypeChange(event.currentTarget.value as 'all' | 'error' | 'warning' | 'info')}
        className="h-8 min-w-[150px]"
      >
        <option value="all">All types</option>
        <option value="error">Errors</option>
        <option value="warning">Warnings</option>
        <option value="info">Info</option>
      </NativeSelect>
    </div>
  );
}
