/**
 * src/modules/auth/services/auth.service.js
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../../config/database');
const { AppError } = require('../../../middleware/errorHandler');
const logger = require('../../../config/logger');

function resolveRole(positionTitle = '') {
  const t = positionTitle.toLowerCase();
  if (t.includes('admin') || t.includes('system')) return 'Admin';
  if (t.includes('hr') || t.includes('human resource')) return 'HR';
  if (t.includes('payroll') || t.includes('compensation')) return 'Payroll';
  if (t.includes('manager') || t.includes('director') || t.includes('head') || t.includes('professor') || t.includes('dean') || t.includes('supervisor')) return 'Manager';
  return 'Employee';
}

function signAccessToken(employee, role) {
  return jwt.sign(
    { sub: employee.EmployeeID, email: employee.Email, role, deptId: employee.DepartmentID, name: employee.FullName ,positionId: employee.PositionID},
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function signRefreshToken(employeeId) {
  return jwt.sign(
    { sub: employeeId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

async function login(email, password) {
  // Find employee
  const employee = await prisma.employee.findUnique({
    where: { Email: email.toLowerCase().trim() },
    include: {
      Position: { select: { PositionTitle: true } },
      Department: { select: { DepartmentName: true } },
      Credential: true,
    },
  });

  // No employee or no credential row → invalid
  if (!employee || !employee.Credential || !employee.Credential.IsActive) {
    logger.warn(`[Auth] Failed login for: ${email}`);
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // Compare password against stored hash
  const isValid = await bcrypt.compare(password, employee.Credential.PasswordHash);
  if (!isValid) {
    logger.warn(`[Auth] Wrong password for: ${email}`);
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!employee.IsActive || employee.CurrentStatus === 'Terminated') {
    throw new AppError('Your account has been deactivated. Please contact HR.', 401, 'ACCOUNT_INACTIVE');
  }

  const role = resolveRole(employee.Position?.PositionTitle);
  const accessToken = signAccessToken(employee, role);
  const refreshToken = signRefreshToken(employee.EmployeeID);

  logger.info(`[Auth] Successful login: ${employee.EmployeeCode} (${role})`);

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    employee: {
      id: employee.EmployeeID,
      code: employee.EmployeeCode,
      name: employee.FullName,
      email: employee.Email,
      role,
      department: employee.Department?.DepartmentName,
      position: employee.Position?.PositionTitle,
      PositionID: employee.PositionID, // 👈 ADDED THIS
      positionId: employee.PositionID, // 👈
      photoURL: employee.PhotoURL,
    },
  };
}

async function refreshAccessToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_TOKEN');
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Token is not a refresh token.', 401, 'INVALID_TOKEN');
  }

  const employee = await prisma.employee.findUnique({
    where: { EmployeeID: decoded.sub },
    include: { Position: { select: { PositionTitle: true } } },
  });

  if (!employee || !employee.IsActive) {
    throw new AppError('Account not found or inactive.', 401, 'ACCOUNT_INACTIVE');
  }

  const role = resolveRole(employee.Position?.PositionTitle);
  const accessToken = signAccessToken(employee, role);

  return { accessToken, tokenType: 'Bearer', expiresIn: process.env.JWT_EXPIRES_IN || '8h' };
}

async function changePassword(employeeId, currentPassword, newPassword) {
  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters.', 400, 'WEAK_PASSWORD');
  }

  const credential = await prisma.userCredential.findUnique({
    where: { EmployeeID: employeeId },
  });

  if (!credential) {
    throw new AppError('No credential record found for this account.', 404, 'NOT_FOUND');
  }

  const isValid = await bcrypt.compare(currentPassword, credential.PasswordHash);
  if (!isValid) {
    throw new AppError('Current password is incorrect.', 401, 'INVALID_CREDENTIALS');
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.userCredential.update({
    where: { EmployeeID: employeeId },
    data: { PasswordHash: newHash, UpdatedAt: new Date() },
  });

  return { message: 'Password changed successfully.' };
}

module.exports = { login, refreshAccessToken, changePassword };