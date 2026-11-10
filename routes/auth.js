
const express = require("express");
const crypto = require("crypto");

const {
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken
} = require("../utils/security");

const { validateRegistration, normalizePhone } =
  require("../utils/validation");

const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

function setSessionCookie(res, token) {
  const production = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    [
      `machroui_session=${encodeURIComponent(token)}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Strict",
      `Max-Age=${Math.floor(SESSION_DURATION / 1000)}`,
      ...(production ? ["Secure"] : [])
    ].join("; ")
  );
}

function clearSessionCookie(res) {
  const production = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    [
      "machroui_session=",
      "HttpOnly",
      "Path=/",
      "SameSite=Strict",
      "Max-Age=0",
      ...(production ? ["Secure"] : [])
    ].join("; ")
  );
}

function getCookieToken(req) {
  const cookies = (req.headers.cookie || "").split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator < 0) continue;

    if (cookie.slice(0, separator).trim() === "machroui_session") {
      try {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

// تسجيل تاجر جديد
router.post("/register", async (req, res) => {
  if (!req.app.locals.pool) {
    return res.status(503).json({
      success: false,
      message: "قاعدة البيانات غير متصلة حالياً"
    });
  }

  const validation = validateRegistration(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.message
    });
  }

  const data = validation.data;
  const pool = req.app.locals.pool;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await hashPassword(data.password);

    const userResult = await client.query(
      `INSERT INTO users
        (full_name, phone, password_hash, role, account_status)
       VALUES ($1, $2, $3, 'seller', 'pending')
       RETURNING id`,
      [data.fullName, data.phone, passwordHash]
    );

    const userId = userResult.rows[0].id;

    const baseSlug = data.projectName
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "store";

    const slug = `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`;

    await client.query(
      `INSERT INTO stores
        (owner_user_id, name, slug, category, wilaya, commune, phone, store_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        userId,
        data.projectName,
        slug,
        data.category,
        data.wilaya,
        data.commune,
        data.phone
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "تم استلام طلب التسجيل، حسابك ينتظر موافقة الإدارة"
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "رقم الهاتف مسجل من قبل"
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر إتمام التسجيل حالياً"
    });
  } finally {
    client.release();
  }
});

// تسجيل الدخول
router.post("/login", async (req, res) => {
  const pool = req.app.locals.pool;

  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "قاعدة البيانات غير متصلة حالياً"
    });
  }

  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;

  if (!phone || typeof password !== "string" || password.length > 128) {
    return res.status(400).json({
      success: false,
      message: "رقم الهاتف أو كلمة المرور غير صحيحة"
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, password_hash, role, account_status
       FROM users
       WHERE phone = $1
       LIMIT 1`,
      [phone]
    );

    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: "رقم الهاتف أو كلمة المرور غير صحيحة"
      });
    }

    if (user.account_status !== "active") {
      return res.status(403).json({
        success: false,
        message:
          user.account_status === "pending"
            ? "حسابك ينتظر موافقة الإدارة"
            : "حسابك غير نشط، يرجى التواصل مع الإدارة"
      });
    }

    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    await pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    setSessionCookie(res, token);

    return res.json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر تسجيل الدخول حالياً"
    });
  }
});

// معلومات الحساب الحالي
router.get("/me", (req, res, next) => {
  return requireAuth(req.app.locals.pool)(req, res, next);
}, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      fullName: req.user.full_name,
      phone: req.user.phone,
      role: req.user.role
    }
  });
});

// تسجيل الخروج
router.post("/logout", async (req, res) => {
  const pool = req.app.locals.pool;
  const token = getCookieToken(req);

  try {
    if (pool && token) {
      await pool.query(
        "DELETE FROM user_sessions WHERE token_hash = $1",
        [hashSessionToken(token)]
      );
    }

    clearSessionCookie(res);

    return res.json({
      success: true,
      message: "تم تسجيل الخروج"
    });
  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر تسجيل الخروج حالياً"
    });
  }
});

module.exports = router;
