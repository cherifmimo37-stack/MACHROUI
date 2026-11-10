

const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

function isValidUUID(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateProduct(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const name =
    typeof data.name === "string" ? data.name.trim().slice(0, 120) : "";

  const description =
    typeof data.description === "string"
      ? data.description.trim().slice(0, 2000)
      : "";

  const rawPrice = data.price;

  if (
    (typeof rawPrice !== "number" && typeof rawPrice !== "string") ||
    (typeof rawPrice === "string" && rawPrice.trim() === "")
  ) {
    return null;
  }

  const price = Number(rawPrice);
  const rawStock = data.stock_quantity;

  const stock =
    rawStock === null ||
    rawStock === undefined ||
    (typeof rawStock === "string" && rawStock.trim() === "")
      ? null
      : (typeof rawStock === "number" || typeof rawStock === "string")
        ? Number(rawStock)
        : NaN;

  if (
    name.length < 2 ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return null;
  }

  if (
    stock !== null &&
    (!Number.isInteger(stock) || stock < 0)
  ) {
    return null;
  }

  return { name, description, price, stock };
}

async function getSellerStore(pool, userId) {
  const result = await pool.query(
    `SELECT id
     FROM stores
     WHERE owner_user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

// جميع مسارات التاجر تتطلب حساباً نشطاً ودور seller
router.use((req, res, next) => {
  return requireAuth(req.app.locals.pool)(req, res, next);
});

router.use(requireRole("seller"));

// عرض منتجات التاجر
router.get("/products", async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const store = await getSellerStore(pool, req.user.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على متجرك"
      });
    }

    const result = await pool.query(
      `SELECT id, name, description, price, stock_quantity, product_status
       FROM products
       WHERE store_id = $1
       ORDER BY created_at DESC`,
      [store.id]
    );

    return res.json({
      success: true,
      products: result.rows
    });
  } catch (error) {
    console.error("Seller products error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر عرض المنتجات"
    });
  }
});

// إضافة منتج
router.post("/products", async (req, res) => {
  const pool = req.app.locals.pool;
  const product = validateProduct(req.body);

  if (!product) {
    return res.status(400).json({
      success: false,
      message: "يرجى التحقق من اسم المنتج والسعر والكمية"
    });
  }

  try {
    const store = await getSellerStore(pool, req.user.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على متجرك"
      });
    }

    const result = await pool.query(
      `INSERT INTO products
        (store_id, name, description, price, stock_quantity, product_status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name, description, price, stock_quantity, product_status`,
      [
        store.id,
        product.name,
        product.description,
        product.price,
        product.stock
      ]
    );

    return res.status(201).json({
      success: true,
      message: "تمت إضافة المنتج",
      product: result.rows[0]
    });
  } catch (error) {
    console.error("Add product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذرت إضافة المنتج"
    });
  }
});

// تعديل منتج يملكه التاجر فقط
router.put("/products/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const product = validateProduct(req.body);
  const productId = req.params.id;

  if (!isValidUUID(productId) || !product) {
    return res.status(400).json({
      success: false,
      message: "بيانات المنتج غير صحيحة"
    });
  }

  try {
    const store = await getSellerStore(pool, req.user.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على متجرك"
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           description = $2,
           price = $3,
           stock_quantity = $4,
           updated_at = NOW()
       WHERE id = $5 AND store_id = $6
       RETURNING id, name, description, price, stock_quantity, product_status`,
      [
        product.name,
        product.description,
        product.price,
        product.stock,
        productId,
        store.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود في متجرك"
      });
    }

    return res.json({
      success: true,
      message: "تم تعديل المنتج",
      product: result.rows[0]
    });
  } catch (error) {
    console.error("Update product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر تعديل المنتج"
    });
  }
});

// إخفاء المنتج دون حذف سجله
router.delete("/products/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const productId = req.params.id;

  if (!isValidUUID(productId)) {
    return res.status(400).json({
      success: false,
      message: "معرّف المنتج غير صحيح"
    });
  }

  try {
    const store = await getSellerStore(pool, req.user.id);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على متجرك"
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET product_status = 'inactive',
           updated_at = NOW()
       WHERE id = $1 AND store_id = $2
       RETURNING id`,
      [productId, store.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المنتج غير موجود في متجرك"
      });
    }

    return res.json({
      success: true,
      message: "تم إخفاء المنتج من المتجر"
    });
  } catch (error) {
    console.error("Hide product error:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر إخفاء المنتج"
    });
  }
});

module.exports = router;

