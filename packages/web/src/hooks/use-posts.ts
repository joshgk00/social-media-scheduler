import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreatePostInput, UpdatePostInput } from '@sms/shared';
import type { MediaItem } from '../components/posts/MediaThumbnail';

interface PostTag {
  id: string;
  name: string;
  color: string;
}

interface PostProfile {
  displayName: string;
  handle: string;
  avatarUrl: string;
}

interface Post {
  id: string;
  profileId: string | null;
  text: string;
  isThread: boolean;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  platformPostId: string | null;
  postVersion: number;
  hasSpinnableText: boolean;
  autoDestructAfter: string | null;
  notes: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  tags: PostTag[];
  media?: MediaItem[];
  profile?: PostProfile;
  headline?: string;
  rank?: number;
}

interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
}

interface PostStatusCountsResponse {
  total: number;
  byStatus: Record<string, number>;
}

interface DashboardPostStatsResponse {
  scheduled24Count: number;
  scheduled24: Post[];
  scheduledInRange: Post[];
  failed24: Post[];
  failed7dCount: number;
  scheduledProfileCount: number;
}

interface ConflictingPost {
  id: string;
  textPreview: string;
  scheduledAt: string;
  status: string;
}

export interface PostFilters {
  status?: string;
  profileId?: string;
  tagId?: string;
  search?: string;
  searchScope?: 'posts' | 'queue' | 'calendar';
  page?: number;
  limit?: number;
}

/**
 * Fetch posts with SERVER-SIDE filtering. All filter params are sent
 * as query parameters -- the API handles filtering in SQL, not JS.
 */
export function usePosts(filters: PostFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.profileId) params.set('profileId', filters.profileId);
  if (filters.tagId) params.set('tagId', filters.tagId);
  if (filters.search) params.set('search', filters.search);
  if (filters.searchScope) params.set('searchScope', filters.searchScope);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  return useQuery({
    queryKey: ['posts', filters],
    queryFn: () => apiClient.get<PostsResponse>(`/api/posts${queryString ? `?${queryString}` : ''}`),
    staleTime: 15_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false, // pause polling when tab hidden (D-15)
  });
}

export function usePostStatusCounts(filters: Omit<PostFilters, 'status' | 'page' | 'limit'> = {}) {
  const params = new URLSearchParams();
  if (filters.profileId) params.set('profileId', filters.profileId);
  if (filters.tagId) params.set('tagId', filters.tagId);
  if (filters.search) params.set('search', filters.search);
  if (filters.searchScope) params.set('searchScope', filters.searchScope);

  const queryString = params.toString();
  return useQuery({
    queryKey: ['posts', 'status-counts', filters],
    queryFn: () => apiClient.get<PostStatusCountsResponse>(`/api/posts/status-counts${queryString ? `?${queryString}` : ''}`),
    staleTime: 15_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardPostStats(range: '24h' | '7d' | '30d') {
  const params = new URLSearchParams({ range });

  return useQuery({
    queryKey: ['posts', 'dashboard-stats', range],
    queryFn: () => apiClient.get<DashboardPostStatsResponse>(`/api/posts/dashboard-stats?${params}`),
    staleTime: 15_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: ['posts', postId],
    queryFn: () => apiClient.get<Post>(`/api/posts/${postId}`),
    staleTime: 15_000,
    enabled: !!postId,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postInput: CreatePostInput) =>
      apiClient.post<Post>('/api/posts', postInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useUpdatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, postInput, postVersion }: { postId: string; postInput: Omit<UpdatePostInput, 'postVersion'>; postVersion: number }) =>
      apiClient.patch<Post>(`/api/posts/${postId}`, { ...postInput, postVersion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useCheckConflicts(profileId: string, scheduledAt: string, excludePostId?: string) {
  const params = new URLSearchParams({ profileId, scheduledAt });
  if (excludePostId) params.set('excludePostId', excludePostId);
  return useQuery({
    // excludePostId must be in the queryKey — otherwise edit-page results
    // for a given (profileId, scheduledAt) would bleed into the new-post
    // page cache and vice versa.
    queryKey: ['posts', 'conflicts', profileId, scheduledAt, excludePostId ?? null],
    queryFn: () => apiClient.get<ConflictingPost[]>(`/api/posts/conflicts?${params}`),
    enabled: !!profileId && !!scheduledAt,
    staleTime: 10_000,
  });
}

export type { Post, PostsResponse, PostTag, PostProfile, PostStatusCountsResponse, DashboardPostStatsResponse };
