import { Router } from 'express';
import path, { resolve } from 'path';
import { unlink, mkdir } from 'node:fs/promises';
import multer from 'multer';
import sharp from 'sharp';
import { eq, sql } from 'drizzle-orm';
import {
  profileUpdateSchema,
  preferencesUpdateSchema,
  passwordChangeSchema,
  totpVerifySchema,
  totpDisableSchema,
  securityQuestionsSchema,
  defaultLandingPageSchema,
} from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Redis } from 'ioredis';
import type { Db } from '@sms/db';
import { users, securityQuestions } from '@sms/db';

import { verifyPassword, hashPassword, getUserById, replaceSecurityQuestions } from '../services/auth.service.js';
import { generateTotpSecret, verifyTotpCode } from '../services/totp.service.js';
import { invalidateOtherSessions, SESSION_PREFIX } from '../services/session.service.js';
import { requireAuth } from '../middleware/auth-guard.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const logger = createLogger('settings-routes');

interface SettingsDependencies {
  db: Db;
  redis: Redis;
}

export function createSettingsRouter({ db, redis }: SettingsDependencies) {
  const router = Router();

  const MEDIA_DIR = process.env.MEDIA_DIR || './data/media';
  const avatarDir = path.join(MEDIA_DIR, 'avatars');

  const upload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        try {
          await mkdir(avatarDir, { recursive: true });
          cb(null, avatarDir);
        } catch (err) {
          cb(err as Error, avatarDir);
        }
      },
      filename: (req, _file, cb) => {
        cb(null, `${req.session.userId}-${Date.now()}.tmp`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed.'));
      }
    },
  });

  router.put('/api/settings/profile', requireAuth, async (req, res) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const profilePatch: Record<string, unknown> = { updatedAt: new Date() };
    const { firstName, lastName, username, email } = parsed.data;
    if (firstName !== undefined) profilePatch.firstName = firstName;
    if (lastName !== undefined) profilePatch.lastName = lastName;
    if (username !== undefined) profilePatch.username = username;
    if (email !== undefined) profilePatch.email = email.toLowerCase().trim();

    await db.update(users).set(profilePatch).where(eq(users.id, req.session.userId!));

    const user = await getUserById(db, req.session.userId!);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImagePath: user.profileImagePath,
      timezone: user.timezone,
      dateFormat: user.dateFormat,
      entriesPerPage: user.entriesPerPage,
      defaultLandingPage: user.defaultLandingPage ?? '/dashboard',
    });
  });

  router.put('/api/settings/preferences', requireAuth, async (req, res) => {
    const parsed = preferencesUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { timezone, dateFormat, entriesPerPage, defaultLandingPage } = parsed.data;

    const preferencesPatch = {
      timezone,
      dateFormat,
      entriesPerPage,
      updatedAt: new Date(),
      ...(defaultLandingPage !== undefined ? { defaultLandingPage } : {}),
    };

    const [updatedPreferences] = await db
      .update(users)
      .set(preferencesPatch)
      .where(eq(users.id, req.session.userId!))
      .returning({ defaultLandingPage: users.defaultLandingPage });
    const responseDefaultLandingPage = defaultLandingPageSchema.parse(
      updatedPreferences?.defaultLandingPage ?? defaultLandingPage ?? '/dashboard',
    );

    res.json({
      timezone,
      dateFormat,
      entriesPerPage,
      defaultLandingPage: responseDefaultLandingPage,
    });
  });

  router.put('/api/settings/password', requireAuth, async (req, res) => {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const user = await getUserById(db, req.session.userId!);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const isPasswordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({
      passwordHash,
      updatedAt: new Date(),
    }).where(eq(users.id, req.session.userId!));

    // D-23: Kill other sessions, keep current
    await invalidateOtherSessions(redis, req.sessionID);

    res.json({ success: true });
  });

  router.post('/api/settings/2fa/setup', requireAuth, async (req, res) => {
    const user = await getUserById(db, req.session.userId!);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    if (user.totpEnabled) {
      res.status(409).json({ error: '2FA is already enabled.' });
      return;
    }

    const { secret, uri } = generateTotpSecret(user.email);
    // Store in session until verified -- don't persist to DB before verification
    req.session.pendingTotpSecret = secret;
    res.json({ secret, uri });
  });

  router.post('/api/settings/2fa/verify', requireAuth, async (req, res) => {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    if (!req.session.pendingTotpSecret) {
      res.status(400).json({ error: 'No pending 2FA setup. Start the setup process first.' });
      return;
    }

    const { code } = parsed.data;
    const isTotpCodeValid = verifyTotpCode(req.session.pendingTotpSecret, code);
    if (!isTotpCodeValid) {
      res.status(401).json({ error: 'Invalid code. Make sure your authenticator time is synced.' });
      return;
    }

    await db.update(users).set({
      totpSecret: req.session.pendingTotpSecret,
      totpEnabled: true,
      updatedAt: new Date(),
    }).where(eq(users.id, req.session.userId!));

    delete req.session.pendingTotpSecret;
    res.json({ success: true });
  });

  // D-20: Disabling 2FA requires both password AND TOTP code. This is stricter
  // than AUTH-06 (password only) per user decision.
  router.post('/api/settings/2fa/disable', requireAuth, async (req, res) => {
    const parsed = totpDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const user = await getUserById(db, req.session.userId!);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    if (!user.totpEnabled) {
      res.status(409).json({ error: '2FA is not enabled.' });
      return;
    }

    const { password, code } = parsed.data;

    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid password or code.' });
      return;
    }

    const isTotpCodeValid = verifyTotpCode(user.totpSecret!, code);
    if (!isTotpCodeValid) {
      res.status(401).json({ error: 'Invalid password or code.' });
      return;
    }

    await db.update(users).set({
      totpEnabled: false,
      totpSecret: null,
      updatedAt: new Date(),
    }).where(eq(users.id, req.session.userId!));

    res.json({ success: true });
  });

  router.get('/api/settings/security-questions', requireAuth, async (req, res) => {
    const questions = await db.select({
      questionIndex: securityQuestions.questionIndex,
    }).from(securityQuestions).where(
      eq(securityQuestions.userId, req.session.userId!),
    );

    if (questions.length === 0) {
      res.json({ configured: false, questionIndices: [] });
      return;
    }

    res.json({
      configured: true,
      questionIndices: questions.map(q => q.questionIndex),
    });
  });

  router.put('/api/settings/security-questions', requireAuth, async (req, res) => {
    const parsed = securityQuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { questions } = parsed.data;

    // Atomic: delete + insert in a single transaction with parallel argon2 hashing
    await replaceSecurityQuestions(db, req.session.userId!, questions);

    res.json({ success: true });
  });

  router.get('/api/settings/sessions', requireAuth, async (req, res) => {
    let sessionCount = 0;
    const stream = redis.scanStream({ match: `${SESSION_PREFIX}*`, count: 100 });
    for await (const keys of stream) {
      sessionCount += (keys as string[]).length;
    }
    res.json({ count: sessionCount });
  });

  router.post('/api/settings/sessions/logout-others', requireAuth, async (req, res) => {
    const deleted = await invalidateOtherSessions(redis, req.sessionID);
    res.json({ success: true, deleted });
  });

  router.get('/api/settings/storage', requireAuth, async (req, res) => {
    const usageRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(file_size), 0)::bigint AS total_size,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN file_size ELSE 0 END), 0)::bigint AS image_size,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'video/%' THEN file_size ELSE 0 END), 0)::bigint AS video_size,
        COALESCE(COUNT(*) FILTER (WHERE mime_type LIKE 'image/%'), 0)::int AS image_count,
        COALESCE(COUNT(*) FILTER (WHERE mime_type LIKE 'video/%'), 0)::int AS video_count
      FROM post_media
      WHERE deleted_at IS NULL
    `);

    const row = usageRows[0] as Record<string, unknown> | undefined;
    res.json({
      totalSize: Number(row?.total_size ?? 0),
      imageSize: Number(row?.image_size ?? 0),
      videoSize: Number(row?.video_size ?? 0),
      imageCount: Number(row?.image_count ?? 0),
      videoCount: Number(row?.video_count ?? 0),
    });
  });

  router.post('/api/settings/profile/image', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          res.status(400).json({ error: err.message });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No image file provided.' });
        return;
      }

      const tmpPath = req.file.path;
      const filename = `${req.session.userId}-${Date.now()}.webp`;
      const outputPath = path.join(avatarDir, filename);

      try {
        // Validate and process image: auto-rotate (strips EXIF orientation),
        // resize to 200x200 square, convert to webp
        await sharp(tmpPath)
          .rotate()
          .resize(200, 200, { fit: 'cover' })
          .toFormat('webp')
          .toFile(outputPath);

        // Clean up old avatar file if user already has one
        const user = await getUserById(db, req.session.userId!);
        if (user?.profileImagePath) {
          // Path traversal guard: ensure resolved path stays within MEDIA_DIR
          const resolvedMedia = resolve(MEDIA_DIR);
          const oldPath = resolve(path.join(MEDIA_DIR, user.profileImagePath));
          if (oldPath.startsWith(resolvedMedia + path.sep)) {
            try {
              await unlink(oldPath);
            } catch {
              // Old file may already be deleted
            }
          }
        }

        // Delete temp uploaded file
        try {
          await unlink(tmpPath);
        } catch {
          // Temp file cleanup is best-effort
        }

        // Update user profile image path
        await db.update(users).set({
          profileImagePath: `/avatars/${filename}`,
          updatedAt: new Date(),
        }).where(eq(users.id, req.session.userId!));

        res.json({ profileImagePath: `/avatars/${filename}` });
      } catch (error) {
        // Clean up temp file on error
        try {
          await unlink(tmpPath);
        } catch {
          // Best-effort cleanup
        }
        logger.error({ err: error, userId: req.session.userId }, 'Avatar processing failed');
        res.status(400).json({ error: 'Invalid or corrupt image file.' });
      }
    });
  });

  return router;
}
