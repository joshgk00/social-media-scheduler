// MSW v2 handlers for Phase 08 LinkedIn + Facebook integration tests.
// Wave 0 ships the helpers so subsequent plans can mount them on a server
// (`setupServer(...phase8LinkedInHandlers, ...phase8FacebookHandlers)`).
//
// Exports:
//   phase8LinkedInHandlers — happy-path handlers for /rest/images, the upload
//     URL PUT, and /rest/posts.
//   phase8FacebookHandlers — happy-path handlers for /{pageId}/photos,
//     /{pageId}/feed, /{pageId}/videos.
//   makeLinkedInFailureHandler / makeFacebookFailureHandler — single-stage
//     overrides for failure-mode tests (rollback, partial-failure orphan).

import { http, HttpResponse } from 'msw';

const LINKEDIN_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_UPLOAD_URL = 'https://www.linkedin.com/dms/uploads/test-upload-url';
const FB_GRAPH_BASE = 'https://graph.facebook.com/v22.0';

export const phase8LinkedInHandlers = [
  http.post(`${LINKEDIN_BASE}/images`, () => {
    return HttpResponse.json({
      value: {
        uploadUrl: LINKEDIN_UPLOAD_URL,
        image: 'urn:li:image:C4D22AQHpEd_test',
      },
    });
  }),
  http.put(LINKEDIN_UPLOAD_URL, () => {
    return new HttpResponse(null, { status: 201 });
  }),
  http.post(`${LINKEDIN_BASE}/posts`, () => {
    return new HttpResponse(null, {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:7000000000000000000' },
    });
  }),
];

export const phase8FacebookHandlers = [
  http.post(`${FB_GRAPH_BASE}/:pageId/photos`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_photo_${Date.now()}` });
  }),
  http.post(`${FB_GRAPH_BASE}/:pageId/feed`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_feedpost_${Date.now()}` });
  }),
  http.post(`${FB_GRAPH_BASE}/:pageId/videos`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_video_${Date.now()}` });
  }),
];

export type LinkedInFailureStage = 'init' | 'put' | 'post';

export function makeLinkedInFailureHandler(stage: LinkedInFailureStage, status: number) {
  if (stage === 'init') {
    return http.post(
      `${LINKEDIN_BASE}/images`,
      () => new HttpResponse('init failed', { status }),
    );
  }
  if (stage === 'put') {
    return http.put(
      LINKEDIN_UPLOAD_URL,
      () => new HttpResponse('put failed', { status }),
    );
  }
  return http.post(
    `${LINKEDIN_BASE}/posts`,
    () => new HttpResponse('post failed', { status }),
  );
}

export type FacebookFailureStage = 'photo' | 'feed' | 'video';

export function makeFacebookFailureHandler(stage: FacebookFailureStage, status: number) {
  const target = stage === 'photo' ? 'photos' : stage === 'feed' ? 'feed' : 'videos';
  return http.post(
    `${FB_GRAPH_BASE}/:pageId/${target}`,
    () => new HttpResponse('fail', { status }),
  );
}
