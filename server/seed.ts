import { storage } from "./storage";

export async function seedDatabase() {
  const existingSettings = await storage.getSettings();
  if (existingSettings && existingSettings.monthlyBudget > 0) {
    return;
  }

  const settings = await storage.upsertSettings({
    monthlyBudget: 2000000,
    payDay: 25,
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  await storage.createOrUpdateBudget(month, year, 2000000);

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = (d: number) => `${year}-${pad(month)}-${pad(d)}`;

  const sampleExpenses = [
    { storeName: "스타벅스 강남점", amount: 5500, category: "cafe", date: dateStr(2), memo: "아메리카노" },
    { storeName: "이마트 성수점", amount: 45000, category: "shopping", date: dateStr(3), memo: "생활용품" },
    { storeName: "교보문고", amount: 18000, category: "education", date: dateStr(5), memo: "프로그래밍 서적" },
    { storeName: "명동칼국수", amount: 9000, category: "food", date: dateStr(6), memo: "점심식사" },
    { storeName: "카카오택시", amount: 12500, category: "transport", date: dateStr(7), memo: "야근 귀가" },
    { storeName: "CGV 영등포", amount: 14000, category: "entertainment", date: dateStr(8), memo: "영화 관람" },
    { storeName: "GS25", amount: 3200, category: "food", date: dateStr(9), memo: "간식" },
    { storeName: "올리브영", amount: 32000, category: "shopping", date: dateStr(10), memo: "스킨케어" },
    { storeName: "투썸플레이스", amount: 6800, category: "cafe", date: dateStr(11), memo: "라떼, 케이크" },
    { storeName: "지하철 충전", amount: 50000, category: "transport", date: dateStr(1), memo: "교통카드" },
    { storeName: "한전", amount: 35000, category: "utilities", date: dateStr(5), memo: "전기요금" },
    { storeName: "새마을식당", amount: 11000, category: "food", date: dateStr(12), memo: "된장찌개" },
    { storeName: "다이소", amount: 8500, category: "shopping", date: dateStr(13), memo: "정리용품" },
    { storeName: "약국", amount: 6000, category: "medical", date: dateStr(14), memo: "감기약" },
    { storeName: "블루보틀", amount: 7000, category: "cafe", date: dateStr(15), memo: "드립커피" },
  ];

  const budget = await storage.getBudget(month, year);

  for (const exp of sampleExpenses) {
    await storage.createExpense({
      budgetId: budget?.id || null,
      storeName: exp.storeName,
      amount: exp.amount,
      category: exp.category,
      date: exp.date,
      memo: exp.memo,
      receiptImage: null,
    });
  }

  console.log("Seed data inserted successfully");
}
