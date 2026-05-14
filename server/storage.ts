import { db as pgDb } from "./db";
import fs from "fs";
import path from "path";
import { db as sqliteDb } from "./db.sqlite";
import { budgets as pgBudgets, expenses as pgExpenses, settings as pgSettings } from "@shared/schema";
import { budgets as sqliteBudgets, expenses as sqliteExpenses, settings as sqliteSettings } from "@shared/schema.sqlite";
import type { Budget, Expense, Settings, InsertExpense } from "@shared/schema";
import { eq, and, desc, gte, lte, lt } from "drizzle-orm";

export interface IStorage {
  getSettings(): Promise<Settings | undefined>;
  upsertSettings(data: { monthlyBudget: number; payDay: number; carryOver?: boolean; ollamaModel?: string }): Promise<Settings>;
  getBudget(month: number, year: number): Promise<Budget | undefined>;
  createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget>;
  getExpenses(month: number, year: number): Promise<Expense[]>;
  getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]>;
  createExpense(data: InsertExpense): Promise<Expense>;
  deleteExpense(id: number): Promise<void>;
}

class DatabaseStorage implements IStorage {
  async getSettings(): Promise<Settings | undefined> {
    const [result] = await pgDb.select().from(pgSettings).limit(1);
    return result;
  }

  async upsertSettings(data: { monthlyBudget: number; payDay: number; carryOver?: boolean; ollamaModel?: string }): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const [updated] = await pgDb
        .update(pgSettings)
        .set({
          monthlyBudget: data.monthlyBudget,
          payDay: data.payDay,
          carryOver: data.carryOver ?? existing.carryOver,
          ollamaModel: data.ollamaModel ?? existing.ollamaModel,
        })
        .where(eq(pgSettings.id, existing.id))
        .returning();
      return updated as Settings;
    }
    const [created] = await pgDb
      .insert(pgSettings)
      .values({
        monthlyBudget: data.monthlyBudget,
        payDay: data.payDay,
        currency: "KRW",
        carryOver: data.carryOver ?? false,
        ollamaModel: data.ollamaModel ?? "llama3",
      })
      .returning();
    return created as Settings;
  }

  async getBudget(month: number, year: number): Promise<Budget | undefined> {
    const [result] = await pgDb
      .select()
      .from(pgBudgets)
      .where(and(eq(pgBudgets.month, month), eq(pgBudgets.year, year)));
    return result as Budget | undefined;
  }

  async createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget> {
    const existing = await this.getBudget(month, year);
    if (existing) {
      const [updated] = await pgDb
        .update(pgBudgets)
        .set({ monthlyAmount: amount })
        .where(eq(pgBudgets.id, existing.id))
        .returning();
      return updated as Budget;
    }
    const s = await this.getSettings();
    const [created] = await pgDb
      .insert(pgBudgets)
      .values({
        monthlyAmount: amount,
        payDay: s?.payDay || 1,
        month,
        year,
      })
      .returning();
    return created as Budget;
  }

  async getExpenses(month: number, year: number): Promise<Expense[]> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    return pgDb
      .select()
      .from(pgExpenses)
      .where(
        and(
          gte(pgExpenses.date, startDate),
          lt(pgExpenses.date, endDate),
        )
      )
      .orderBy(desc(pgExpenses.date)) as Promise<Expense[]>;
  }

  async getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
    return pgDb
      .select()
      .from(pgExpenses)
      .where(
        and(
          gte(pgExpenses.date, startDate),
          lte(pgExpenses.date, endDate),
        )
      )
      .orderBy(desc(pgExpenses.date)) as Promise<Expense[]>;
  }

  async createExpense(data: InsertExpense): Promise<Expense> {
    const [created] = await pgDb.insert(pgExpenses).values(data).returning();
    return created as Expense;
  }

  async deleteExpense(id: number): Promise<void> {
    await pgDb.delete(pgExpenses).where(eq(pgExpenses.id, id));
  }
}

class SqliteStorage implements IStorage {
  async getSettings(): Promise<Settings | undefined> {
    const [result] = await sqliteDb.select().from(sqliteSettings).limit(1);
    return result as Settings | undefined;
  }

  async upsertSettings(data: { monthlyBudget: number; payDay: number; carryOver?: boolean; ollamaModel?: string }): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      await sqliteDb
        .update(sqliteSettings)
        .set({
          monthlyBudget: data.monthlyBudget,
          payDay: data.payDay,
          carryOver: data.carryOver ?? existing.carryOver,
          ollamaModel: data.ollamaModel ?? existing.ollamaModel,
        })
        .where(eq(sqliteSettings.id, existing.id));
      return (await this.getSettings())!;
    }
    await sqliteDb
      .insert(sqliteSettings)
      .values({
        monthlyBudget: data.monthlyBudget,
        payDay: data.payDay,
        currency: "KRW",
        carryOver: data.carryOver ?? false,
        ollamaModel: data.ollamaModel ?? "llama3",
      });
    return (await this.getSettings())!;
  }

  async getBudget(month: number, year: number): Promise<Budget | undefined> {
    const [result] = await sqliteDb
      .select()
      .from(sqliteBudgets)
      .where(and(eq(sqliteBudgets.month, month), eq(sqliteBudgets.year, year)));
    return result as Budget | undefined;
  }

  async createOrUpdateBudget(month: number, year: number, amount: number): Promise<Budget> {
    const existing = await this.getBudget(month, year);
    if (existing) {
      await sqliteDb
        .update(sqliteBudgets)
        .set({ monthlyAmount: amount })
        .where(eq(sqliteBudgets.id, existing.id));
      return (await this.getBudget(month, year))!;
    }
    const s = await this.getSettings();
    await sqliteDb
      .insert(sqliteBudgets)
      .values({
        monthlyAmount: amount,
        payDay: s?.payDay || 1,
        month,
        year,
      });
    return (await this.getBudget(month, year))!;
  }

  async getExpenses(month: number, year: number): Promise<Expense[]> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    return sqliteDb
      .select()
      .from(sqliteExpenses)
      .where(
        and(
          gte(sqliteExpenses.date, startDate),
          lt(sqliteExpenses.date, endDate),
        )
      )
      .orderBy(desc(sqliteExpenses.date)) as Promise<Expense[]>;
  }

  async getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
    return sqliteDb
      .select()
      .from(sqliteExpenses)
      .where(
        and(
          gte(sqliteExpenses.date, startDate),
          lte(sqliteExpenses.date, endDate),
        )
      )
      .orderBy(desc(sqliteExpenses.date)) as Promise<Expense[]>;
  }

  async createExpense(data: InsertExpense): Promise<Expense> {
    // Force save image to disk if it's base64
    if (data.receiptImage && data.receiptImage.includes("base64,")) {
      try {
        const base64Image = data.receiptImage;
        const date = data.date || new Date().toISOString().split("T")[0];
        const storeName = data.storeName || "unknown";
        const amount = data.amount || 0;

        const safeDate = date.replace(/\./g, "-");
        const baseDir = path.resolve(process.cwd(), "attached_assets", "receipts");
        const dateDir = path.join(baseDir, safeDate);
        
        if (!fs.existsSync(dateDir)) {
          fs.mkdirSync(dateDir, { recursive: true });
        }

        const base64Data = base64Image.split("base64,")[1];
        const fileName = `${storeName.replace(/[\\/:*?"<>|]/g, "").trim()}_${amount}_${Date.now()}.jpg`;
        const filePath = path.join(dateDir, fileName);
        
        fs.writeFileSync(filePath, base64Data, 'base64');
        data.receiptImage = `/uploads/receipts/${safeDate}/${fileName}`;
        console.log(`[STORAGE-SAVE] Image saved to: ${filePath}`);
      } catch (err) {
        console.error("[STORAGE-SAVE] Error saving image:", err);
      }
    }

    const [result] = await sqliteDb.insert(sqliteExpenses).values(data).returning();
    return result as Expense;
  }

  async deleteExpense(id: number): Promise<void> {
    await sqliteDb.delete(sqliteExpenses).where(eq(sqliteExpenses.id, id));
  }
}

export const storage = process.env.DATABASE_URL ? new DatabaseStorage() : new SqliteStorage();
