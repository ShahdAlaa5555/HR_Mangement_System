/**
 * src/modules/employee/validations/employee.validation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Joi Validation Schemas — Employee Module
 *
 * THESIS NOTE:
 * These schemas enforce the same constraints as the SQL Server CHECK constraints
 * at the API layer (before the request reaches the database), providing faster
 * feedback to client applications and reducing unnecessary DB round-trips.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Joi = require('joi');
const {
  GENDER,
  MARITAL_STATUS,
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  CHANGE_REQUEST_STATUS,
} = require('../../../shared/constants');

// ─── Employee CRUD ────────────────────────────────────────────────────────────

const createEmployeeSchema = Joi.object({
  EmployeeCode: Joi.string().max(20).required()
    .description('Unique employee identifier, e.g. EMP001'),
  FirstName: Joi.string().max(80).required(),
  LastName: Joi.string().max(80).required(),
  DateOfBirth: Joi.date().iso().max('now').required()
    .messages({ 'date.max': 'Date of birth cannot be in the future' }),
  Gender: Joi.string().valid(...Object.values(GENDER)).required(),
  Nationality: Joi.string().max(80).required(),
  MaritalStatus: Joi.string().valid(...Object.values(MARITAL_STATUS)).required(),
  Email: Joi.string().email().max(150).required(),
  Phone: Joi.string().max(30).allow(null, '').optional(),
  Address: Joi.string().max(250).allow(null, '').optional(),
  Bio: Joi.string().allow(null, '').optional(),
  DepartmentID: Joi.number().integer().positive().required(),
  PositionID: Joi.number().integer().positive().required(),
  EmploymentType: Joi.string().valid(...Object.values(EMPLOYMENT_TYPE)).required(),
  StartDate: Joi.date().iso().required(),
  EndDate: Joi.date().iso().min(Joi.ref('StartDate')).allow(null).optional(),
  SupervisorID: Joi.number().integer().positive().allow(null).optional(),
  WorkLocationID: Joi.number().integer().positive().required(),
  HasDisability: Joi.boolean().default(false),
   password: Joi.string().min(8).required(),
});

const updateEmployeeSchema = Joi.object({
  FirstName: Joi.string().max(80),
  LastName: Joi.string().max(80),
  Email: Joi.string().email().max(150),  // ← ADD THIS
  DateOfBirth: Joi.date().iso().max('now'),
  Gender: Joi.string().valid(...Object.values(GENDER)),
  Nationality: Joi.string().max(80),
  MaritalStatus: Joi.string().valid(...Object.values(MARITAL_STATUS)),
  Phone: Joi.string().max(30).allow(null, ''),
  Address: Joi.string().max(250).allow(null, ''),
  Bio: Joi.string().allow(null, ''),
  PhotoURL: Joi.string().uri().max(300).allow(null, ''),
  DepartmentID: Joi.number().integer().positive(),
  PositionID: Joi.number().integer().positive(),
  EmploymentType: Joi.string().valid(...Object.values(EMPLOYMENT_TYPE)),
  StartDate: Joi.date().iso(),
  EndDate: Joi.date().iso().allow(null),
  SupervisorID: Joi.number().integer().positive().allow(null),
  WorkLocationID: Joi.number().integer().positive(),
  CurrentStatus: Joi.string().valid(...Object.values(EMPLOYEE_STATUS)),
  HasDisability: Joi.boolean(),
}).min(1); // At least one field required for update

const employeeListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  // 1. INCREASE MAX LIMIT TO 1000
  limit: Joi.number().integer().min(1).max(1000).default(20), 
  search: Joi.string().max(100).allow('').optional()
    .description('Searches EmployeeCode, FullName, Email'),
  departmentId: Joi.number().integer().positive().optional(),
  positionId: Joi.number().integer().positive().optional(),
  employmentType: Joi.string().valid(...Object.values(EMPLOYMENT_TYPE)).optional(),
  // 2. ALLOW BOTH CAPITALIZED AND LOWERCASE IF NECESSARY
  status: Joi.string().optional(), 
  workLocationId: Joi.number().integer().positive().optional(),
  supervisorId: Joi.number().integer().positive().optional(),
  // 3. ALLOW STRINGS FOR BOOLEANS (since query params are strings)
  isActive: Joi.any().optional(), 
}).unknown(true); // 4. ADD .unknown(true) to prevent crashes on extra params

// ─── Change Request ───────────────────────────────────────────────────────────

const createChangeRequestSchema = Joi.object({
  FieldName: Joi.string().max(100).required()
    .description('Name of the field to change, e.g. Phone, Address'),
  NewValue: Joi.string().required()
    .description('Desired new value for the field'),
  // OldValue is fetched server-side from current record
});

const reviewChangeRequestSchema = Joi.object({
  Status: Joi.string().valid(
    CHANGE_REQUEST_STATUS.APPROVED,
    CHANGE_REQUEST_STATUS.REJECTED
  ).required(),
  ReviewNote: Joi.string().max(500).allow(null, '').optional(),
});

// ─── Salary ──────────────────────────────────────────────────────────────────

const createSalarySchema = Joi.object({
  PayGradeID: Joi.number().integer().positive().required(),
  BaseSalary: Joi.number().positive().precision(2).required(),
  CurrencyCode: Joi.string().max(10).default('EGP'),
  EffectiveFrom: Joi.date().iso().required(),
  EffectiveTo: Joi.date().iso().min(Joi.ref('EffectiveFrom')).allow(null).optional(),
  ChangeReason: Joi.string().max(200).allow(null, '').optional(),
});

// ─── Department ──────────────────────────────────────────────────────────────

const createDepartmentSchema = Joi.object({
  DepartmentCode: Joi.string().max(20).required(),
  DepartmentName: Joi.string().max(100).required(),
  ManagerID: Joi.number().integer().positive().allow(null).optional(),
  IsActive: Joi.boolean().default(true),
});

const updateDepartmentSchema = Joi.object({
  DepartmentName: Joi.string().max(100),
  ManagerID: Joi.number().integer().positive().allow(null),
  IsActive: Joi.boolean(),
}).min(1);

// ─── Position ────────────────────────────────────────────────────────────────

const createPositionSchema = Joi.object({
  PositionCode: Joi.string().max(20).required(),
  PositionTitle: Joi.string().max(100).required(),
  PayGradeID: Joi.number().integer().positive().allow(null).optional(),
  IsActive: Joi.boolean().default(true),
});
// ADD THIS ABOVE module.exports

// ─── Emergency Contacts ───────────────────────────────────────────────────────
const createEmergencyContactSchema = Joi.object({
  ContactName: Joi.string().max(150).required(),
  Relationship: Joi.string().max(50).required(),
  Phone: Joi.string().max(30).required(),
  AltPhone: Joi.string().max(30).allow(null, '').optional(),
  IsPrimary: Joi.boolean().default(false),
});

const updateEmergencyContactSchema = Joi.object({
  ContactName: Joi.string().max(150),
  Relationship: Joi.string().max(50),
  Phone: Joi.string().max(30),
  AltPhone: Joi.string().max(30).allow(null, ''),
  IsPrimary: Joi.boolean(),
}).min(1);

// ─── Skills ───────────────────────────────────────────────────────────────────
const createSkillSchema = Joi.object({
  SkillName: Joi.string().max(100).required(),
  ProficiencyLevel: Joi.string().valid('Beginner', 'Intermediate', 'Advanced', 'Expert').required(),
  YearsExperience: Joi.number().integer().min(0).allow(null).optional(),
});

// Add this above module.exports
const createNoteSchema = Joi.object({
  NoteText: Joi.string().max(2000).required(),
});



module.exports = {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeListQuerySchema,
  createChangeRequestSchema,
  reviewChangeRequestSchema,
  createSalarySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  createPositionSchema,
  createEmergencyContactSchema,
  updateEmergencyContactSchema,
  createSkillSchema,
  createNoteSchema
};
