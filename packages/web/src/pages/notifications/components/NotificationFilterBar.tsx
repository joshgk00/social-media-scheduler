import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface NotificationFilterBarProps {
  readStatus: 'all' | 'read' | 'unread';
  onReadStatusChange: (readStatus: 'all' | 'read' | 'unread') => void;
}

export function NotificationFilterBar({ readStatus, onReadStatusChange }: NotificationFilterBarProps) {
  return (
    <Tabs value={readStatus} onValueChange={(value) => onReadStatusChange(value as 'all' | 'read' | 'unread')}>
      <TabsList aria-label="Notification read status">
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="unread">Unread</TabsTrigger>
        <TabsTrigger value="read">Read</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
