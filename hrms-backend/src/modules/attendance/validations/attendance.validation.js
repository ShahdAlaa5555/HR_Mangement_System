/**
 * src/modules/attendance/validations/attendance.validation.js
 */

const Joi = require('joi');
const { ATTENDANCE_STATUS, MAX_OVERTIME_HOURS_PER_DAY } = require('../../../shared/constants');

const checkInSchema = Joi.object({
  // Location can be captured for geo-fencing in the future
  location: Joi.string().max(100).allow(null, '').optional(),
  notes: Joi.string().max(500).allow(null, '').optional(),
});

const checkOutSchema = Joi.object({
  notes: Joi.string().max(500).allow(null, '').optional(),
});

const manualAttendanceSchema = Joi.object({
  EmployeeID: Joi.number().integer().positive().required(),
  AttendanceDate: Joi.date().iso().max('now').required(),
  CheckInTime: Joi.date().iso().allow(null).optional(),
  CheckOutTime: Joi.date().iso().allow(null).optional(),
  Status: Joi.string().valid(...Object.values(ATTENDANCE_STATUS)).required(),
  ShiftID: Joi.number().integer().positive().allow(null).optional(),
  Notes: Joi.string().max(500).allow(null, '').optional(),
  IsManualEntry: Joi.boolean().default(true),
});

const correctionRequestSchema = Joi.object({
  CorrectedCheckIn: Joi.date().iso().allow(null).optional(),
  CorrectedCheckOut: Joi.date().iso().allow(null).optional(),
  Reason: Joi.string().max(500).required(),
}).or('CorrectedCheckIn', 'CorrectedCheckOut')
  .messages({ 'object.missing': 'At least one of CorrectedCheckIn or CorrectedCheckOut is required.' });

const reviewCorrectionSchema = Joi.object({
  Status: Joi.string().valid('Approved', 'Rejected').required(),
  ReviewNote: Joi.string().max(300).allow(null, '').optional(),
});

const overtimeRequestSchema = Joi.object({
  EmployeeID: Joi.number().integer().positive().required(),
  OvertimeDate: Joi.date().iso().required(),
  EstimatedHours: Joi.number().positive().max(MAX_OVERTIME_HOURS_PER_DAY).required()
    .messages({
      'number.max': `Overtime cannot exceed ${MAX_OVERTIME_HOURS_PER_DAY} hours per day (Egyptian Labor Law).`,
    }),
  IsNighttime: Joi.boolean().default(false),
  Reason: Joi.string().max(500).required(),
});

const shiftAssignmentSchema = Joi.object({
  EmployeeID: Joi.number().integer().positive().required(),
  ShiftID: Joi.number().integer().positive().required(),
  EffectiveFrom: Joi.date().iso().required(),
  EffectiveTo: Joi.date().iso().min(Joi.ref('EffectiveFrom')).allow(null).optional(),
});

const attendanceQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  employeeId: Joi.number().integer().positive().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  status: Joi.string().valid(...Object.values(ATTENDANCE_STATUS)).optional(),
  departmentId: Joi.number().integer().positive().optional(),
});

const summaryQuerySchema = Joi.object({
  year: Joi.number().integer().min(2020).max(2100).required(),
  month: Joi.number().integer().min(1).max(12).required(),
});

module.exports = {
  checkInSchema,
  checkOutSchema,
  manualAttendanceSchema,
  correctionRequestSchema,
  reviewCorrectionSchema,
  overtimeRequestSchema,
  shiftAssignmentSchema,
  attendanceQuerySchema,
  summaryQuerySchema,
};
