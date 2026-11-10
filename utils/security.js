
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// تشفير كلمة المرور باستخدام scrypt
async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل");
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);

  return [
    "scrypt",
    "16384",
    "8",
    "1",
    salt.toString("hex"),
    derivedKey.toString("hex")
  ].join("$");
}

// التحقق من كلمة المرور
async function verifyPassword(password, storedHash) {
  try {
    if (typeof password !== "string" || typeof storedHash !== "string") {
      return false;
    }

    const parts = storedHash.split("$");

    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }

    if (
      parts[1] !== "16384" ||
      parts[2] !== "8" ||
      parts[3] !== "1" ||
      !/^[a-f0-9]{32}$/i.test(parts[4]) ||
      !/^[a-f0-9]{128}$/i.test(parts[5])
    ) {
      return false;
    }

    const salt = Buffer.from(parts[4], "hex");
    const originalHash = Buffer.from(parts[5], "hex");

    const newHash = await scrypt(password, salt, KEY_LENGTH);

    return crypto.timingSafeEqual(newHash, originalHash);
  } catch {
    return false;
  }
}

// إنشاء رمز جلسة عشوائي
function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// تخزين بصمة الرمز بدلاً من الرمز الأصلي
function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken
};
