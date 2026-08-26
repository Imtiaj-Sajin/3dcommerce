// Admin authentication: bcrypt passwords, JWT sessions, role gates.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one, exec } from './db.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.warn('[auth] JWT_SECRET is missing or too short - set a long random value in .env');
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);

export async function verifyLogin(email, password) {
  const user = await one(
    'SELECT id, email, password_hash, name, role, is_active FROM admin_users WHERE email = ?',
    [String(email || '').toLowerCase().trim()]
  );
  if (!user || !user.is_active) return null;
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) return null;
  await exec('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '12h' }
  );
}

export function readToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.cookies?.mm_token || null;
}

/** Express middleware: require a valid admin token. */
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'auth_required' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.admin = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

const ORDER = { editor: 1, admin: 2, owner: 3 };

/** Express middleware: require at least the given role. */
export function requireRole(min) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'auth_required' });
    if ((ORDER[req.admin.role] || 0) < (ORDER[min] || 99)) {
      return res.status(403).json({ error: 'forbidden', need: min });
    }
    next();
  };
}
