import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CreatePostInput, UpdatePostInput } from '@sms/shared';

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
  profileId: string;
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
  profile?: PostProfile;
}

interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
}

interface ConflictingPost {
  text: string;
  scheduledAt: string;
}

export interface PostFilters {
  status?: string;
  profileId?: string;
  tagId?: string;
  search?: string;
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
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();
  return useQuery({
    queryKey: ['posts', filters],
    queryFn: () => apiClient.get<PostsResponse>(`/api/posts${queryString ? `?${queryString}` : ''}`),
    staleTime: 15_000,
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
    queryKey: ['posts', 'conflicts', profileId, scheduledAt],
    queryFn: () => apiClient.get<ConflictingPost[]>(`/api/posts/conflicts?${params}`),
    enabled: !!profileId && !!scheduledAt,
    staleTime: 10_000,
  });
}

export type { Post, PostsResponse, PostTag, PostProfile };
