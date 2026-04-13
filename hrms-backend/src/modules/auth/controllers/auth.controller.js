/**
 * src/modules/auth/controllers/auth.controller.js
 */
const service = require('../services/auth.service');
const { sendSuccess } = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');

async function login(req, res) {
  const { email, password } = req.body;
  const result = await service.login(email, password);
  return sendSuccess(res, result, 200);
}

async function refresh(req, res) {
  const result = await service.refreshAccessToken(req.body.refreshToken);
  return sendSuccess(res, result);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const result = await service.changePassword(req.user.id, currentPassword, newPassword);
  return sendSuccess(res, result);
}

async function me(req, res) {
  return sendSuccess(res, req.user);
}

module.exports = { login, refresh, changePassword, me };
