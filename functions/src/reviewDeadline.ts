import Holidays from 'date-holidays';

const seoulOffset = 9 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;
const workPeriods = [[9, 12], [13, 18]] as const;
const koreanHolidays = new Holidays('KR');

// date-holidays 3.39.2 omits these 2026 additions. Keep the official annual
// calendar and the dependency in sync when new elections or special days appear.
koreanHolidays.setHoliday('05-01 since 2026', { name: '노동절', type: 'public' });
koreanHolidays.setHoliday('substitutes 05-01 if Saturday,Sunday then next Monday since 2026', { name: '노동절', type: 'public', substitute: true });
koreanHolidays.setHoliday('2026-06-03', { name: '전국동시지방선거', type: 'public' });

function seoulDate(instant: number): Date {
  return new Date(instant + seoulOffset);
}

function isWorkingDate(year: number, month: number, day: number): boolean {
  const noon = new Date(Date.UTC(year, month - 1, day, 12) - seoulOffset);
  const weekday = noon.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const holiday = koreanHolidays.isHoliday(noon);
  return !holiday || !holiday.some((item) => item.type === 'public');
}

/** Add 8 hours per working day, counting only Korean office hours from submission. */
export function calculateReviewDeadline(submittedAt: Date, reviewWorkingDays: number): Date {
  if (!Number.isFinite(submittedAt.getTime()) || !Number.isInteger(reviewWorkingDays) || reviewWorkingDays < 1 || reviewWorkingDays > 10) {
    throw new RangeError('제출 시각과 1~10근무일의 검수 기간이 필요합니다.');
  }
  return calculateWorkingHoursDeadline(submittedAt, reviewWorkingDays * 8);
}

/** Find the instant after the requested number of Korean office hours. */
export function calculateWorkingHoursDeadline(startedAt: Date, workingHours: number): Date {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(workingHours) || workingHours <= 0 || workingHours > 80) {
    throw new RangeError('올바른 시작 시각과 근무시간이 필요합니다.');
  }
  let remaining = workingHours * hour;
  let cursor = startedAt.getTime();
  for (let dayOffset = 0; dayOffset < 60; dayOffset += 1) {
    const local = seoulDate(cursor);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth() + 1;
    const day = local.getUTCDate();
    if (isWorkingDate(year, month, day)) {
      for (const [startHour, endHour] of workPeriods) {
        const start = Date.UTC(year, month - 1, day, startHour) - seoulOffset;
        const end = Date.UTC(year, month - 1, day, endHour) - seoulOffset;
        const from = Math.max(cursor, start);
        if (from >= end) continue;
        const available = end - from;
        if (remaining <= available) return new Date(from + remaining);
        remaining -= available;
      }
    }
    cursor = Date.UTC(year, month - 1, day + 1) - seoulOffset;
  }
  throw new RangeError('검수 기한을 계산할 수 없습니다. 공휴일 데이터를 확인해 주세요.');
}
