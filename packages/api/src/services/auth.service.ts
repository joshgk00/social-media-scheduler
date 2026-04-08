import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { users, securityQuestions } from '@sms/db';
import type { Db } from '@sms/db';
import { createLogger } from '@sms/shared';

const logger = createLogger('auth-service');

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    logger.error({ err }, 'argon2.verify failed unexpectedly');
    return false;
  }
}

export async function createUser(
  db: Db,
  data: { email: string; password: string; timezone: string },
) {
  const passwordHash = await hashPassword(data.password);
  const normalizedEmail = data.email.toLowerCase().trim();
  const [user] = await db.insert(users).values({
    email: normalizedEmail,
    passwordHash,
    timezone: data.timezone,
  }).returning();
  return user;
}

export async function findUserByEmail(db: Db, email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await db.select().from(users).where(eq(users.email, normalizedEmail));
  return result[0] ?? null;
}

export async function getUserById(db: Db, id: string) {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0] ?? null;
}

export async function userExists(db: Db): Promise<boolean> {
  const result = await db.select({ id: users.id }).from(users).limit(1);
  return result.length > 0;
}

export async function updateLastLogin(db: Db, id: string) {
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
}

export async function getSecurityQuestions(db: Db, userId: string) {
  return db.select().from(securityQuestions).where(eq(securityQuestions.userId, userId));
}

export async function resetPasswordAndDisableTotp(
  db: Db,
  userId: string,
  newPasswordHash: string,
): Promise<void> {
  await db.update(users).set({
    passwordHash: newPasswordHash,
    totpEnabled: false,
    totpSecret: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}

export async function replaceSecurityQuestions(
  db: Db,
  userId: string,
  questions: Array<{ questionIndex: number; answer: string }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(securityQuestions).where(eq(securityQuestions.userId, userId));
    const hashed = await Promise.all(
      questions.map(async (q) => ({
        userId,
        questionIndex: q.questionIndex,
        answerHash: await argon2.hash(q.answer.toLowerCase().trim(), { type: argon2.argon2id }),
      })),
    );
    await tx.insert(securityQuestions).values(hashed);
  });
}
