import assert from 'node:assert/strict';
import { calculateReviewDeadline } from '../lib/reviewDeadline.js';

const seoul = (local) => new Date(`${local}+09:00`);
const cases = [
  ['평일 09시 시작', '2026-11-16T09:00:00', 1, '2026-11-16T18:00:00'],
  ['점심시간 제외', '2026-11-16T11:30:00', 1, '2026-11-17T11:30:00'],
  ['점심 중 제출', '2026-11-16T12:30:00', 1, '2026-11-17T12:00:00'],
  ['금요일 17시 + 2근무일', '2026-11-13T17:00:00', 2, '2026-11-17T17:00:00'],
  ['금요일 20시 + 2근무일', '2026-11-13T20:00:00', 2, '2026-11-17T18:00:00'],
  ['주말 제출', '2026-11-14T10:00:00', 1, '2026-11-16T18:00:00'],
  ['초 단위 보존', '2026-11-13T17:30:15', 1, '2026-11-16T17:30:15'],
  ['노동절 제외', '2026-04-30T17:00:00', 1, '2026-05-04T17:00:00'],
  ['지방선거일 제외', '2026-06-02T17:00:00', 1, '2026-06-04T17:00:00'],
  ['제헌절 제외', '2026-07-16T17:00:00', 1, '2026-07-20T17:00:00'],
  ['부처님오신날 대체공휴일 제외', '2026-05-22T17:00:00', 1, '2026-05-26T17:00:00'],
  ['추석 연휴 제외', '2026-09-23T17:00:00', 1, '2026-09-28T17:00:00'],
  ['기독탄신일 제외', '2026-12-24T17:00:00', 1, '2026-12-28T17:00:00'],
  ['연도 경계', '2026-12-31T17:00:00', 1, '2027-01-04T17:00:00'],
  ['노동절 대체공휴일 제외', '2027-04-30T17:00:00', 1, '2027-05-04T17:00:00'],
  ['설날 대체공휴일 제외', '2027-02-05T17:00:00', 1, '2027-02-10T17:00:00'],
];

for (const [name, submitted, days, expected] of cases) {
  assert.equal(calculateReviewDeadline(seoul(submitted), days).toISOString(), seoul(expected).toISOString(), name);
}
for (const days of [0, 11, 1.5]) assert.throws(() => calculateReviewDeadline(seoul('2026-11-16T09:00:00'), days), RangeError);
assert.throws(() => calculateReviewDeadline(new Date('invalid'), 1), RangeError);
console.log(`PASS: ${cases.length} review deadline cases cover office hours, weekends, holidays, substitutes, and year boundaries.`);
