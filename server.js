
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const authRoutes = require("./routes/auth");
const catalogRoutes = require("./routes/catalog");
const sellerRoutes = require("./routes/seller");

const app = express();
const PORT = process.env.PORT || 10000;

// إعدادات الحماية الأساسية
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
// حماية إضافية لمسارات الحسابات
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

// ربط نظام التسجيل والدخول
app.use("/api/auth", authRoutes);
// ربط واجهة المتاجر والمنتجات
app.use("/api/catalog", catalogRoutes);
app.use("/api/seller", sellerRoutes);
// تحديد عدد الطلبات لحماية الخادم
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

// الاتصال بقاعدة البيانات عند توفير DATABASE_URL
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
      max: 5,
      connectionTimeoutMillis: 10000
    })
  : null;
app.locals.pool = pool;

// مسار فحص الخادم وقاعدة البيانات
app.get("/api/health", async (req, res) => {
  let database = "not_configured";

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch (error) {
      console.error("Database health check failed:", error.message);
      database = "disconnected";
    }
  }

  res.status(database === "disconnected" ? 503 : 200).json({
    success: database !== "disconnected",
    application: "MACHROUI",
    server: "running",
    database
  });
});

// الصفحة الرئيسية المؤقتة للخادم
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "مرحباً بك في واجهة MACHROUI البرمجية"
  });
});

// معالجة المسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "المسار المطلوب غير موجود"
  });
});

// معالجة الأخطاء
app.use((error, req, res, next) => {
  console.error("Server error:", error.message);

  res.status(500).json({
    success: false,
    message: "حدث خطأ داخلي في الخادم"
  });
});

// تشغيل الخادم
const server = app.listen(PORT, () => {
  console.log(`MACHROUI server running on port ${PORT}`);
});

// إغلاق الاتصالات بطريقة آمنة
async function shutdown() {
  console.log("Shutting down MACHROUI server...");

  server.close(async () => {
    if (pool) {
      await pool.end();
    }

    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
