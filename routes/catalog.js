
const express = require("express");

const router = express.Router();

// عرض المتاجر والبحث والتصفية
router.get("/stores", async (req, res) => {
  const pool = req.app.locals.pool;

  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "الخدمة غير متاحة حالياً"
    });
  }

  try {
    const search = String(req.query.search || "").trim().slice(0, 100);
    const wilaya = String(req.query.wilaya || "").trim().slice(0, 50);
    const category = String(req.query.category || "").trim().slice(0, 60);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      30
    );

    const offset = Math.max(
      parseInt(req.query.offset, 10) || 0,
      0
    );

    const result = await pool.query(
      `SELECT
         s.id,
         s.name,
         s.slug,
         s.description,
         s.category,
         s.wilaya,
         s.commune,
         s.logo_url,
         s.cover_url,
         COUNT(p.id)::int AS products_count
       FROM stores s
       LEFT JOIN products p
         ON p.store_id = s.id
        AND p.status = 'active'
       WHERE s.store_status = 'active'
         AND ($1 = '' OR s.name ILIKE '%' || $1 || '%')
         AND ($2 = '' OR s.wilaya = $2)
         AND ($3 = '' OR s.category = $3)
       GROUP BY s.id
       ORDER BY s.name ASC
       LIMIT $4 OFFSET $5`,
      [search, wilaya, category, limit, offset]
    );

    return res.json({
      success: true,
      stores: result.rows,
      pagination: {
        limit,
        offset,
        returned: result.rows.length
      }
    });
  } catch (error) {
    console.error("Stores listing error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر عرض المتاجر حالياً"
    });
  }
});

// معلومات متجر محدد
router.get("/stores/:slug", async (req, res) => {
  const pool = req.app.locals.pool;

  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "الخدمة غير متاحة حالياً"
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         slug,
         description,
         category,
         wilaya,
         commune,
         logo_url,
         cover_url
       FROM stores
       WHERE slug = $1
         AND store_status = 'active'
       LIMIT 1`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    return res.json({
      success: true,
      store: result.rows[0]
    });
  } catch (error) {
    console.error("Store details error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر عرض المتجر حالياً"
    });
  }
});

// عرض منتجات متجر محدد
router.get("/stores/:slug/products", async (req, res) => {
  const pool = req.app.locals.pool;

  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "الخدمة غير متاحة حالياً"
    });
  }

  try {
    const storeResult = await pool.query(
      `SELECT id
       FROM stores
       WHERE slug = $1
         AND store_status = 'active'
       LIMIT 1`,
      [req.params.slug]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المتجر غير موجود"
      });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      30
    );

    const offset = Math.max(
      parseInt(req.query.offset, 10) || 0,
      0
    );

    const productsResult = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.price,
         p.stock_quantity,
         (
           SELECT pi.image_url
           FROM product_images pi
           WHERE pi.product_id = p.id
           ORDER BY pi.display_order ASC
           LIMIT 1
         ) AS image_url
       FROM products p
       WHERE p.store_id = $1
         AND p.status = 'active'
       ORDER BY p.id DESC
       LIMIT $2 OFFSET $3`,
      [storeResult.rows[0].id, limit, offset]
    );

    return res.json({
      success: true,
      products: productsResult.rows,
      pagination: {
        limit,
        offset,
        returned: productsResult.rows.length
      }
    });
  } catch (error) {
    console.error("Products listing error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر عرض المنتجات حالياً"
    });
  }
});

module.exports = router;
