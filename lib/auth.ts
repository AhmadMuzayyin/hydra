import "server-only";

import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 7;
const AUTH_SECRET = process.env.AUTH_SECRET || "hydra-static-auth-secret";
const STATIC_USER = {
  id: "static-admin",
  username: "admin",
  passwordHash: "$2a$10$iVM9TFhpNsftPqoQZISkpOXUf8TY8XFp95QAMyGhE8R2QGVedu2q.",
  role: "admin" as const,
};

type SessionPayload = {
  username: string;
  role: string;
  exp: number;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function signSession(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", AUTH_SECRET).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.username || !payload?.role || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

async function getCookieStore() {
  return await cookies();
}

export async function createSession(username: string, role = "admin") {
  const payload: SessionPayload = {
    username,
    role,
    exp: Date.now() + SESSION_DAYS * 86400_000,
  };
  const token = signSession(payload);
  const cookieStore = await getCookieStore();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });

  return token;
}

export async function destroySession() {
  const cookieStore = await getCookieStore();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await getCookieStore();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = verifySession(token);
  if (!session) return null;
  if (session.username !== STATIC_USER.username || session.role !== STATIC_USER.role) return null;

  return {
    id: STATIC_USER.id,
    username: STATIC_USER.username,
    role: STATIC_USER.role,
    created_at: new Date(0).toISOString(),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}
