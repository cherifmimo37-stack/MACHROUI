
function cleanText(value, maxLength = 100) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizePhone(value) {
  if (typeof value !== "string") return "";

  let phone = value.replace(/[\s().-]/g, "");

  if (phone.startsWith("+213")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("00213")) {
    phone = "0" + phone.slice(5);
  }

  return /^0[567]\d{8}$/.test(phone) ? phone : "";
}

function validateRegistration(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, message: "بيانات التسجيل غير صحيحة" };
  }

  const fullName = cleanText(data.fullName, 80);
  const projectName = cleanText(data.projectName, 100);
  const phone = normalizePhone(data.phone);
  const wilaya = cleanText(data.wilaya, 50);
  const commune = cleanText(data.commune, 60);
  const category = cleanText(data.category, 60);
  const password = data.password;

  if (fullName.length < 3) {
    return { valid: false, message: "يرجى إدخال الاسم الكامل" };
  }

  if (projectName.length < 2) {
    return { valid: false, message: "يرجى إدخال اسم المشروع" };
  }

  if (!phone) {
    return { valid: false, message: "رقم الهاتف غير صحيح" };
  }

  if (!wilaya || !commune || !category) {
    return { valid: false, message: "يرجى إكمال معلومات المشروع" };
  }

  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return {
      valid: false,
      message: "كلمة المرور يجب أن تكون بين 8 و128 حرفاً"
    };
  }

  return {
    valid: true,
    data: {
      fullName,
      projectName,
      phone,
      wilaya,
      commune,
      category,
      password
    }
  };
}

module.exports = {
  cleanText,
  normalizePhone,
  validateRegistration
};
