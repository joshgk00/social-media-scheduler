import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ALWAYS_ON_EVENT_TYPES,
  NOTIFICATION_EVENTS,
  type NotificationEventType,
  notificationEventTypeSchema,
} from '@sms/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useNotificationPrefs,
  useSmtpStatus,
  useUpdateNotificationPrefs,
  type NotificationPrefRow,
} from '@/hooks/use-notifications';

export interface NotificationsTabProps {
  smtpStatus?: { configured: boolean };
  prefs?: NotificationPrefRow[];
  onSave?: (prefs: NotificationPrefRow[]) => Promise<unknown> | unknown;
}

const notificationPrefFormRowSchema = z.object({
  eventType: notificationEventTypeSchema,
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});

const notificationPrefsFormSchema = z.object({
  rows: z.array(notificationPrefFormRowSchema),
});

type NotificationPrefsFormValues = z.infer<typeof notificationPrefsFormSchema>;

function defaultPrefs(): NotificationPrefRow[] {
  return NOTIFICATION_EVENTS.map((eventSpec) => ({
    eventType: eventSpec.eventType,
    inAppEnabled: eventSpec.deferred ? false : true,
    emailEnabled: eventSpec.supportsEmail && !eventSpec.deferred,
  }));
}

function mergePrefs(prefs?: NotificationPrefRow[]): NotificationPrefRow[] {
  const prefsByEventType = new Map(prefs?.map((prefRow) => [prefRow.eventType, prefRow]));
  return defaultPrefs().map((defaultPrefRow) => {
    const savedPrefRow = prefsByEventType.get(defaultPrefRow.eventType);
    return {
      eventType: defaultPrefRow.eventType,
      inAppEnabled: savedPrefRow?.inAppEnabled ?? defaultPrefRow.inAppEnabled,
      emailEnabled: savedPrefRow?.emailEnabled ?? defaultPrefRow.emailEnabled,
    };
  });
}

function NotificationsTabView({
  smtpStatus,
  prefs,
  onSave,
  isSaving = false,
}: NotificationsTabProps & { isSaving?: boolean }) {
  const initialPrefs = useMemo(() => mergePrefs(prefs), [prefs]);
  const form = useForm<NotificationPrefsFormValues>({
    resolver: zodResolver(notificationPrefsFormSchema),
    defaultValues: { rows: initialPrefs },
  });
  const draftPrefs = useWatch({ control: form.control, name: 'rows' }) ?? initialPrefs;
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const isSmtpOff = smtpStatus?.configured === false;
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    form.reset({ rows: initialPrefs });
  }, [form, initialPrefs]);

  function updatePref(eventType: NotificationEventType, field: 'inAppEnabled' | 'emailEnabled', checked: boolean) {
    const prefIndex = draftPrefs.findIndex((prefRow) => prefRow.eventType === eventType);
    if (prefIndex === -1) return;

    form.setValue(`rows.${prefIndex}.${field}`, checked, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setSavedMessage(null);
    setSaveErrorMessage(null);
  }

  async function handleSave() {
    try {
      const formValues = notificationPrefsFormSchema.parse(form.getValues());
      await onSave?.(formValues.rows);
      form.reset(formValues);
      setSaveErrorMessage(null);
      setSavedMessage('Preferences saved');
      toast.success('Preferences saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save preferences';
      setSavedMessage(null);
      setSaveErrorMessage(message);
      toast.error(message);
    }
  }

  return (
    <section className="space-y-4" aria-label="Notification preferences">
      {isSmtpOff && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Email notifications are off</AlertTitle>
          <AlertDescription>
            Email notifications are off — SMTP isn&apos;t configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM env vars to enable. In-app notifications still work.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>In-app</TableHead>
              <TableHead>Email{isSmtpOff ? ' (SMTP off)' : ''}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {NOTIFICATION_EVENTS.map((eventSpec) => {
              const prefRow = draftPrefs.find((candidatePrefRow) => candidatePrefRow.eventType === eventSpec.eventType);
              const isAlwaysOn = ALWAYS_ON_EVENT_TYPES.has(eventSpec.eventType);
              const isDeferred = eventSpec.deferred === true;
              const isEmailDisabled = !eventSpec.supportsEmail || isDeferred || isAlwaysOn;
              const isInAppDisabled = isAlwaysOn || isDeferred;

              return (
                <TableRow key={eventSpec.eventType}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{eventSpec.label}</p>
                      {!isDeferred && <p className="text-sm text-muted-foreground">{eventSpec.helpText}</p>}
                      {isAlwaysOn && (
                        <p className="text-xs text-muted-foreground">Required notification — cannot be disabled</p>
                      )}
                      {isDeferred && (
                        <p className="text-xs text-muted-foreground">Available when bulk operations ship in Phase 10.</p>
                      )}
                      {!eventSpec.supportsEmail && !isDeferred && (
                        <p className="text-xs text-muted-foreground">In-app only — no email for this event.</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${eventSpec.label} in-app notifications`}
                      checked={isAlwaysOn || (prefRow?.inAppEnabled ?? true)}
                      disabled={isInAppDisabled}
                      onCheckedChange={(checked) => updatePref(eventSpec.eventType, 'inAppEnabled', checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`${eventSpec.label} email notifications`}
                      checked={isAlwaysOn || (eventSpec.supportsEmail && !isDeferred && (prefRow?.emailEnabled ?? true))}
                      disabled={isEmailDisabled}
                      onCheckedChange={(checked) => updatePref(eventSpec.eventType, 'emailEnabled', checked)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <a href="/settings/email-logs">Email logs</a>
        </Button>
        <div className="flex items-center gap-3">
          {savedMessage && (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {savedMessage}
            </p>
          )}
          {saveErrorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {saveErrorMessage}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              form.reset({ rows: initialPrefs });
              setSavedMessage(null);
              setSaveErrorMessage(null);
            }}
            disabled={!isDirty || isSaving}
          >
            Discard changes
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save preferences
          </Button>
        </div>
      </div>
    </section>
  );
}

function NotificationsTabContainer() {
  const prefsQuery = useNotificationPrefs();
  const smtpStatusQuery = useSmtpStatus();
  const updatePrefsMutation = useUpdateNotificationPrefs();

  return (
    <NotificationsTabView
      smtpStatus={smtpStatusQuery.data}
      prefs={prefsQuery.data?.rows}
      isSaving={updatePrefsMutation.isPending}
      onSave={(prefs) => updatePrefsMutation.mutateAsync(prefs)}
    />
  );
}

export function NotificationsTab(props: NotificationsTabProps) {
  if (props.smtpStatus !== undefined || props.prefs !== undefined || props.onSave !== undefined) {
    return <NotificationsTabView {...props} />;
  }

  return <NotificationsTabContainer />;
}
