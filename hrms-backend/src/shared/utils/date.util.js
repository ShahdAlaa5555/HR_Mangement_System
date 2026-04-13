/**
 * src/shared/utils/date.util.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Date & Time Utility Functions
 *
 * THESIS NOTE:
 * Date arithmetic is one of the most error-prone areas in HR systems due to:
 *   • Timezones (employees in different locations)
 *   • Weekend/holiday exclusion in leave calculations
 *   • Month boundary conditions in payroll periods
 *
 * dayjs was chosen over Moment.js (deprecated) and the native Date object
 * because it is immutable, lightweight (2KB), and has a clean plugin ecosystem.
 *
 * All functions operate on UTC/date-only values to avoid TZ drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * Counts business days (Mon–Fri) between two dates inclusive,
 * excluding a list of holiday dates.
 *
 * Used in: Leave day counting, payroll working day calculation.
 *
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @param {Date[]} [holidays] - array of holiday Date objects
 * @returns {number} count of business days
 */
function countBusinessDays(startDate, endDate, holidays = []) {
  const holidaySet = new Set(
    holidays.map((h) => dayjs(h).format('YYYY-MM-DD'))
  );

  let count = 0;
  let current = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');

  while (current.isSameOrBefore(end)) {
    const dow = current.day(); // 0=Sun, 6=Sat
    const dateStr = current.format('YYYY-MM-DD');
    if (dow !== 0 && dow !== 5 && dow !== 6 && !holidaySet.has(dateStr)) {
      // NOTE: Egyptian work week is Sun–Thu (0–4), Fri–Sat off
      // Adjust: 0=Sun(work), 1=Mon(work), 2=Tue(work), 3=Wed(work), 4=Thu(work), 5=Fri(off), 6=Sat(off)
      count++;
    }
    current = current.add(1, 'day');
  }
  return count;
}

/**
 * Egyptian work week version (Sun–Thu).
 */
function countEgyptianBusinessDays(startDate, endDate, holidays = []) {
  const holidaySet = new Set(holidays.map((h) => dayjs(h).format('YYYY-MM-DD')));
  let count = 0;
  let current = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');

  while (current.isSameOrBefore(end)) {
    const dow = current.day();
    const dateStr = current.format('YYYY-MM-DD');
    // Egyptian work week: Sunday(0) through Thursday(4)
    if (dow >= 0 && dow <= 4 && !holidaySet.has(dateStr)) {
      count++;
    }
    current = current.add(1, 'day');
  }
  return count;
}

/**
 * Returns the first and last date of a given year/month.
 */
function getMonthBounds(year, month) {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = start.endOf('month');
  return {
    startDate: start.toDate(),
    endDate: end.toDate(),
    daysInMonth: start.daysInMonth(),
  };
}

/**
 * Calculates hours between two DateTime values (for worked hours).
 * Returns a number rounded to 2 decimal places.
 */
function calcHoursDiff(start, end) {
  if (!start || !end) return 0;
  const diffMs = dayjs(end).diff(dayjs(start), 'minute');
  return Math.max(0, parseFloat((diffMs / 60).toFixed(2)));
}

/**
 * Calculates lateness in minutes.
 * @param {Date} shiftStart - expected start time (combined with date)
 * @param {Date} actualCheckin
 * @returns {number} minutes late (0 if on time)
 */
function calcLatenessMinutes(shiftStart, actualCheckin) {
  if (!actualCheckin || !shiftStart) return 0;
  const diff = dayjs(actualCheckin).diff(dayjs(shiftStart), 'minute');
  return Math.max(0, diff);
}

/**
 * Returns today's date as 'YYYY-MM-DD' string (no time component).
 */
function todayStr() {
  return dayjs().format('YYYY-MM-DD');
}

/**
 * Checks whether two date ranges overlap.
 */
function datesOverlap(start1, end1, start2, end2) {
  return dayjs(start1).isSameOrBefore(end2) && dayjs(end1).isSameOrAfter(start2);
}

/**
 * Gets the number of months between hire date and now (for tenure checks).
 */
function monthsSince(fromDate) {
  return dayjs().diff(dayjs(fromDate), 'month');
}

module.exports = {
  countBusinessDays,
  countEgyptianBusinessDays,
  getMonthBounds,
  calcHoursDiff,
  calcLatenessMinutes,
  todayStr,
  datesOverlap,
  monthsSince,
  dayjs,
};
