export interface BudgetPeriod {
  startDate: string;
  endDate: string;
  label: string;
  periodMonth: number;
  periodYear: number;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function clampDay(day: number, year: number, month: number): number {
  const maxDay = lastDayOfMonth(year, month);
  return Math.min(day, maxDay);
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function getBudgetPeriod(payDay: number, refDate?: Date): BudgetPeriod {
  const ref = refDate || new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  const refDay = ref.getDate();

  const clampedPayDay = clampDay(payDay, refYear, refMonth);

  let startMonth: number;
  let startYear: number;

  if (refDay >= clampedPayDay) {
    startMonth = refMonth;
    startYear = refYear;
  } else {
    if (refMonth === 1) {
      startMonth = 12;
      startYear = refYear - 1;
    } else {
      startMonth = refMonth - 1;
      startYear = refYear;
    }
  }

  const actualStartDay = clampDay(payDay, startYear, startMonth);
  const startDate = formatDate(startYear, startMonth, actualStartDay);

  let endMonth: number;
  let endYear: number;
  if (startMonth === 12) {
    endMonth = 1;
    endYear = startYear + 1;
  } else {
    endMonth = startMonth + 1;
    endYear = startYear;
  }

  const nextPayDay = clampDay(payDay, endYear, endMonth);
  const endDay = nextPayDay - 1;

  let endDate: string;
  let labelEndMonth: number;
  let labelEndDay: number;
  if (endDay < 1) {
    const prevM = endMonth === 1 ? 12 : endMonth - 1;
    const prevY = endMonth === 1 ? endYear - 1 : endYear;
    const lastDay = lastDayOfMonth(prevY, prevM);
    endDate = formatDate(prevY, prevM, lastDay);
    labelEndMonth = prevM;
    labelEndDay = lastDay;
  } else {
    endDate = formatDate(endYear, endMonth, endDay);
    labelEndMonth = endMonth;
    labelEndDay = endDay;
  }

  const label = `${startMonth}/${actualStartDay} ~ ${labelEndMonth}/${labelEndDay}`;

  return {
    startDate,
    endDate,
    label,
    periodMonth: startMonth,
    periodYear: startYear,
  };
}

export function getPreviousBudgetPeriod(payDay: number, currentPeriod: BudgetPeriod): BudgetPeriod {
  const startParts = currentPeriod.startDate.split("-").map(Number);
  const prevRef = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  prevRef.setDate(prevRef.getDate() - 1);
  return getBudgetPeriod(payDay, prevRef);
}

export function daysLeftInPeriod(endDate: string): number {
  const end = new Date(endDate + "T23:59:59");
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
