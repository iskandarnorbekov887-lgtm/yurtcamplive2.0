This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Isky Camp Flow

A comprehensive Yurt Camp Management System built with Next.js, Supabase, and Electron for both web and desktop deployment.

## Features

- **Role-based access control:** CEO, Manager, Cook, and Reserver portals
- **CEO Command Center:** Occupancy maps, financial reports, PDF generation, team management
- **Manager Portal:** Check-in/check-out workflow, expense tracking with photo receipts
- **Cook Portal:** Meal order lists, grocery request system
- **Booking Management:** Calendar view with manual and iCal sync support
- **Desktop & Web:** Runs as both a web app and standalone desktop application

## Setup Instructions

### 1. Supabase Database Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the following:

```sql
-- ROLE TYPES
CREATE TYPE user_role AS ENUM ('CEO', 'Manager', 'Reserver', 'Cook');

-- USER PROFILES
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  role user_role DEFAULT 'Manager',
  full_name TEXT
);

-- CAMP INFRASTRUCTURE
CREATE TABLE yurts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Clean',
  type TEXT DEFAULT 'Standard'
);

-- GUEST TRACKING
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  yurt_id INTEGER REFERENCES yurts(id),
  guest_name TEXT NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  total_price DECIMAL(10,2),
  source TEXT DEFAULT 'Manual',
  status TEXT DEFAULT 'confirmed'
);

-- FINANCE & GROCERY
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  category TEXT CHECK (category IN ('Grocery', 'Maintenance', 'Freelance')),
  item_name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit_price DECIMAL(10,2),
  total_amount DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- INITIAL CAMP SETUP
INSERT INTO yurts (name) VALUES ('Yurt #1'), ('Yurt #2'), ('Yurt #3'), ('Yurt #4'), ('Yurt #5');
```

3. Create a storage bucket called `receipts` for expense photos:
   - Go to Storage → New bucket → Name: `receipts` → Public bucket

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these values from your Supabase project settings → API.

### 3. First User Setup

1. Run `npm run dev` and go to http://localhost:3000
2. Sign up with your email (defaults to Manager role)
3. In Supabase Table Editor, find your profile row
4. Change `role` to `CEO`
5. Refresh the app - you'll now have full access

## Available Scripts

- `npm run dev` - Start Next.js dev server
- `npm run build` - Build for production
- `npm run electron:dev` - Build and run Electron desktop app
- `npm run electron:build` - Build and package desktop installer

## Role-Based Portals

- **CEO:** `/ceo` - Full system access, reports, team management
- **Manager:** `/manager` - Operations, expenses with photo upload
- **Cook:** `/cook` - Meal orders, grocery requests
- **Reserver:** `/bookings` - Calendar, booking management

## Desktop App (Electron)

The project also runs as a desktop application using Electron.

### Desktop Development

```bash
npm run electron:dev
```

This builds the Next.js static export, compiles Electron files, and launches the desktop window.

### Desktop Production Build

```bash
npm run electron:build    # Build installer
npm run electron:pack     # Build without packaging
```

Built applications are in the `release/` directory.

### Project Structure

```
├── src/                  # Next.js application
│   ├── app/             # Page routes
│   ├── lib/             # Supabase, auth context
│   └── components/      # Protected route wrapper
├── electron/            # Electron main and preload
├── out/                 # Static export for Electron
└── release/             # Packaged desktop apps
```

## Smart Features

- **Auto price memory:** When Managers log expenses, the system remembers previous unit prices and auto-fills them
- **Photo requirement:** Expense submission is disabled until a receipt photo is uploaded
- **Real-time occupancy:** Visual yurt status with color coding
- **PDF Reports:** Generate weekly/monthly financial reports

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS for styling
- Supabase (Auth + Database + Storage)
- Electron for desktop wrapper
- jsPDF for report generation
