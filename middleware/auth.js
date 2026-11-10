
const { hashSessionToken } = require("../utils/security");

// قراءة رمز الجلسة من Cookie
function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const name = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (name === "machroui_session") {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}

// التحقق من هوية المستخدم
function requireAuth(pool) {
  return async (req, res, next) => {
    try {
      const token = getSessionToken(req);

      if (!token || !pool) {
        return res.status(401).json({
          success: false,
          message: "يرجى تسجيل الدخول أولاً"
        });
      }

      const tokenHash = hashSessionToken(token);

      const result = await pool.query(
        `SELECT u.id, u.full_name, u.phone, u.role, u.account_status
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND u.account_status = 'active'
         LIMIT 1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً"
        });
      }

      req.user = result.rows[0];

      next();
    } catch (error) {
      console.error("Authentication error:", error.message);

      return res.status(500).json({
        success: false,
        message: "تعذر التحقق من الجلسة"
      });
    }
  };
}

// السماح بأدوار محددة فقط
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "ليست لديك صلاحية لتنفيذ هذه العملية"
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
