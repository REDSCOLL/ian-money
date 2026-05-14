import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthlyAmount: integer("monthly_amount").notNull().default(0),
  payDay: integer("pay_day").notNull().default(1),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  budgetId: integer("budget_id").references(() => budgets.id, { onDelete: "cascade" }),
  storeName: text("store_name").notNull(),
  amount: integer("amount").notNull(),
  category: text("category").notNull().default("etc"),
  memo: text("memo"),
  date: text("date").notNull(),
  receiptImage: text("receipt_image"),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthlyBudget: integer("monthly_budget").notNull().default(0),
  payDay: integer("pay_day").notNull().default(1),
  currency: text("currency").notNull().default("KRW"),
  carryOver: integer("carry_over", { mode: "boolean" }).notNull().default(0),
  ollamaModel: text("ollama_model").notNull().default("llama3"),
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
