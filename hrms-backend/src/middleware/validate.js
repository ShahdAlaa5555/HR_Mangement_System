/**
 * src/middleware/validate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Joi Input Validation Middleware Factory
 *
 * THESIS NOTE:
 * Input validation is the first line of defense. Every incoming request body
 * is validated against a Joi schema BEFORE reaching the service/business layer.
 * This prevents:
 *   1. Invalid data from reaching the database
 *   2. SQL injection via unexpected data types
 *   3. Business logic errors from malformed inputs
 *
 * Joi was chosen over express-validator because:
 *   • Declarative, composable schema definitions
 *   • Rich type coercion (strings → dates, etc.)
 *   • Detailed, field-level error messages suitable for frontend consumption
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Joi = require('joi');

/**
 * Creates Express middleware that validates req.body against a Joi schema.
 * On failure, returns 422 with field-level error details.
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,   // collect ALL errors, not just the first
      stripUnknown: true,  // silently remove fields not in schema (security)
      convert: true,       // coerce strings to proper types
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));

      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed.',
          details,
        },
      });
    }

    // Replace request body/params/query with validated & coerced values
    req[property] = value;
    return next();
  };
}

/**
 * Standardized success response helper.
 * All successful API responses use this shape:
 * {
 *   success: true,
 *   data: { ... },
 *   meta: { pagination... }  // optional
 * }
 */
function sendSuccess(res, data, statusCode = 200, meta = null) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
}

/**
 * Pagination helper — standardizes limit/offset from query params.
 */
function getPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    parseInt(query.limit, 10) || parseInt(process.env.DEFAULT_PAGE_SIZE, 10) || 20,
    parseInt(process.env.MAX_PAGE_SIZE, 10) || 9000000000
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildPaginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}

module.exports = { validate, sendSuccess, getPagination, buildPaginationMeta };
