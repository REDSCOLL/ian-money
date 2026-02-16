import { db } from "./db";
import { budgets, expenses, settings } from "@shared/schema";
import type { Budget, InsertBudget, Expense, InsertExpense, Settings, InsertSettings } from "@shared/schema";
import { eq, and, desc, gte, lt } from "drizzle-orm";

export interface IStorage {
  getSettings(): Promise<Settings | undefined>;
  upsertSettings(data: { monthlyBudget: number; payDay: number }): Promise<Settings>;
  getBudget(month: number, year: number): Promise<Budget | undefined>;
  createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget>;
  getExpenses(month: number, year: number): Promise<Expense[]>;
  createExpense(data: InsertExpense): Promise<Expense>;
  deleteExpense(id: number): Promise<void>;
}

class DatabaseStorage implements IStorage {
  async getSettings(): Promise<Settings | undefined> {
    const [result] = await db.select().from(settings).limit(1);
    return result;
  }

  async upsertSettings(data: { monthlyBudget: number; payDay: number }): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ monthlyBudget: data.monthlyBudget, payDay: data.payDay })
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(settings)
      .values({ monthlyBudget: data.monthlyBudget, payDay: data.payDay, currency: "KRW" })
      .returning();
    return created;
  }

  async getBudget(month: number, year: number): Promise<Budget | undefined> {
    const [result] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.month, month), eq(budgets.year, year)));
    return result;
  }

  async createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget> {
    const existing = await this.getBudget(month, year);
    if (existing) {
      const [updated] = await db
        .update(budgets)
        .set({ monthlyAmount: amount })
        .where(eq(budgets.id, existing.id))
        .returning();
      return updated;
    }
    const s = await this.getSettings();
    const [created] = await db
      .insert(budgets)
      .values({
        monthlyAmount: amount,
        payDay: s?.payDay || 1,
        month,
        year,
      })
      .returning();
    return created;
  }

  async getExpenses(month: number, year: number): Promise<Expense[]> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    return db
      .select()
      .from(expenses)
      .where(
        and(
          gte(expenses.date, startDate),
          lt(expenses.date, endDate),
        )
      )
      .orderBy(desc(expenses.date));
  }

  async createExpense(data: InsertExpense): Promise<Expense> {
    const [created] = await db.insert(expenses).values(data).returning();
    return created;
  }

  async deleteExpense(id: number): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }
}

export const storage = new DatabaseStorage();
