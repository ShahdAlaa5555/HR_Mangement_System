/**
 * src/modules/payroll/validations/payroll.validation.js
 */
const Joi = require('joi');
const { PAYROLL_RUN_STATUS, PAY_PERIOD } = require('../../../shared/constants');

const createPayrollPolicySchema = Joi.object({
  PolicyName: Joi.string().max(150).required(),
  PayPeriod: Joi.string().valid(...Object.values(PAY_PERIOD)).required(),
  CutoffDay: Joi.number().integer().min(1).max(31).required(),
  PaymentDay: Joi.number().integer().min(1).max(31).required(),
  OvertimeRuleID: Joi.number().integer().positive().allow(null).optional(),
  TaxCalculationMethod: Joi.string().default('Standard'),
  MaxMonthlyDeductionDays: Joi.number().integer().min(0).default(5),
  MinimumWageEGP: Joi.number().positive().default(6000),
  AnnualIncrementRatePct: Joi.number().positive().default(3.0),
});

const createPayrollRunSchema = Joi.object({
  PolicyID: Joi.number().integer().positive().required(),
  PeriodYear: Joi.number().integer().min(2020).required(),
  PeriodMonth: Joi.number().integer().min(1).max(12).required(),
  PeriodStartDate: Joi.date().iso().required(),
  PeriodEndDate: Joi.date().iso().min(Joi.ref('PeriodStartDate')).required(),
  CutoffDate: Joi.date().iso().required(),
  PaymentDate: Joi.date().iso().required(),
});

const processPayrollRunSchema = Joi.object({
  includeEmployeeIds: Joi.array().items(Joi.number().integer().positive()).optional()
    .description('If provided, only process these employees; otherwise process all active employees'),
});

const approvePayrollRunSchema = Joi.object({
  comments: Joi.string().max(500).allow(null, '').optional(),
});

const resolveExceptionSchema = Joi.object({
  resolution: Joi.string().valid('Resolved', 'Waived').required(),
  ResolutionNotes: Joi.string().max(500).required(),
});

const createPayGradeSchema = Joi.object({
  GradeCode: Joi.string().max(20).required(),
  GradeName: Joi.string().max(100).required(),
  MinSalary: Joi.number().positive().required(),
  MaxSalary: Joi.number().positive().min(Joi.ref('MinSalary')).required(),
  CurrencyCode: Joi.string().max(10).default('EGP'),
});

const createPayTypeSchema = Joi.object({
  PayTypeCode: Joi.string().max(20).required(),
  PayTypeName: Joi.string().max(100).required(),
  Category: Joi.string().valid('Earning', 'Deduction', 'Benefit').required(),
  IsRecurring: Joi.boolean().default(true),
  IsTaxable: Joi.boolean().default(true),
  IsInsurable: Joi.boolean().default(true),
});

const createOvertimeRuleSchema = Joi.object({
  RuleName: Joi.string().max(100).required(),
  ThresholdHours: Joi.number().positive().required(),
  Multiplier: Joi.number().positive().required(),
  AppliesTo: Joi.string().max(50).allow(null, '').optional(),
  IsNighttime: Joi.boolean().default(false),
  IsRestDay: Joi.boolean().default(false),
});

const generateBankFileSchema = Joi.object({
  FileFormat: Joi.string().valid('EFT', 'SWIFT', 'CSV').required(),
});

const payrollRunQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid(...Object.values(PAYROLL_RUN_STATUS)).optional(),
  year: Joi.number().integer().min(2020).optional(),
  policyId: Joi.number().integer().positive().optional(),
});

module.exports = {
  createPayrollPolicySchema, createPayrollRunSchema, processPayrollRunSchema,
  approvePayrollRunSchema, resolveExceptionSchema, createPayGradeSchema,
  createPayTypeSchema, createOvertimeRuleSchema, generateBankFileSchema,
  payrollRunQuerySchema,
};
