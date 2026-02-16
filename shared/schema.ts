import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, date, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  monthlyAmount: integer("monthly_amount").notNull().default(0),
  payDay: integer("pay_day").notNull().default(1),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  budgetId: integer("budget_id").references(() => budgets.id, { onDelete: "cascade" }),
  storeName: text("store_name").notNull(),
  amount: integer("amount").notNull(),
  category: text("category").notNull().default("etc"),
  memo: text("memo"),
  date: text("date").notNull(),
  receiptImage: text("receipt_image"),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  monthlyBudget: integer("monthly_budget").notNull().default(0),
  payDay: integer("pay_day").notNull().default(1),
  currency: text("currency").notNull().default("KRW"),
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

export const CATEGORIES = [
  { value: "food", label: "식비", icon: "UtensilsCrossed" },
  { value: "transport", label: "교통", icon: "Car" },
  { value: "shopping", label: "쇼핑", icon: "ShoppingBag" },
  { value: "entertainment", label: "여가", icon: "Gamepad2" },
  { value: "medical", label: "의료", icon: "Heart" },
  { value: "education", label: "교육", icon: "GraduationCap" },
  { value: "utilities", label: "공과금", icon: "Zap" },
  { value: "cafe", label: "카페", icon: "Coffee" },
  { value: "etc", label: "기타", icon: "MoreHorizontal" },
] as const;

export type CategoryValue = typeof CATEGORIES[number]["value"];
