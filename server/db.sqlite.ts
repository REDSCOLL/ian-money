import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema.sqlite";
import path from "path";

const sqlite = new Database(path.resolve(process.cwd(), "sqlite.db"));
export const db = drizzle(sqlite, { schema });

// Auto-migrate (create tables if they don't exist)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monthly_amount INTEGER NOT NULL DEFAULT 0,
    pay_day INTEGER NOT NULL DEFAULT 1,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'etc',
    memo TEXT,
    date TEXT NOT NULL,
    receipt_image TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monthly_budget INTEGER NOT NULL DEFAULT 0,
    pay_day INTEGER NOT NULL DEFAULT 1,
    currency TEXT NOT NULL DEFAULT 'KRW',
    carry_over INTEGER NOT NULL DEFAULT 0,
    ollama_model TEXT NOT NULL DEFAULT 'llama3'
  );
`);
