import { useQuery } from '@tanstack/react-query';
import type { CalendarQuery, CalendarResponse } from '@sms/shared';
import { apiClient } from '../lib/api-client';

export function useCalendarPosts(query: CalendarQuery | undefined) {
  const params = new URLSearchParams();

  if (query) {
    params.set('from', query.from);
    params.set('to', query.to);
    params.set('scope', query.scope);
    query.platforms?.forEach((platform) => params.append('platforms', platform));
    query.profileIds?.forEach((profileId) => params.append('profileIds', profileId));
    query.tagIds?.forEach((tagId) => params.append('tagIds', tagId));
    if (query.search) params.set('search', query.search);
  }

  const queryString = params.toString();

  return useQuery({
    queryKey: ['calendar', query],
    queryFn: () => apiClient.get<CalendarResponse>(`/api/calendar?${queryString}`),
    enabled: !!query,
    staleTime: 30_000,
  });
}
