# Monthly Budget Tracker (월간 가계부)

## Overview
A mobile-optimized budget management app with AI-powered receipt scanning. Users set monthly budgets and track expenses by photographing receipts, which are automatically analyzed and categorized.

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Express.js + TypeScript
- Database: PostgreSQL with Drizzle ORM
- AI: OpenAI (via Replit AI Integrations) for receipt image analysis
- Routing: wouter
- State: TanStack React Query

## Project Structure
```
client/src/
  pages/           - Dashboard, Scan, History, Report, Settings
  components/      - CategoryIcon, BottomNav, UI components
  lib/             - utils (formatCurrency, getCategoryLabel, etc.)
server/
  index.ts         - Express server entry
  routes.ts        - API endpoints
  storage.ts       - Database operations (IStorage interface)
  db.ts            - Drizzle DB connection
  seed.ts          - Seed data
shared/
  schema.ts        - Drizzle schemas, types, CATEGORIES constant
```

## Key Features
1. Monthly budget setting with pay day configuration
2. Receipt photo capture → AI analysis (GPT vision)
3. Expense tracking with 9 categories
4. Daily/category expense views
5. Monthly report with spending analytics
6. Dark mode support
7. Mobile-optimized bottom navigation

## API Routes
- GET/PUT /api/settings - Budget settings
- GET /api/budgets/:month/:year - Monthly budget
- GET /api/expenses/:month/:year - Monthly expenses
- POST /api/expenses - Create expense
- DELETE /api/expenses/:id - Delete expense
- POST /api/receipts/analyze - AI receipt analysis

## Database Tables
- settings: monthlyBudget, payDay, currency
- budgets: monthlyAmount, payDay, month, year
- expenses: storeName, amount, category, date, memo, receiptImage

## Categories
food, transport, shopping, entertainment, medical, education, utilities, cafe, etc

## Design
- Color theme: Teal/green primary (168°)
- Font: Plus Jakarta Sans
- Mobile-first with bottom navigation
- Light/dark mode support
