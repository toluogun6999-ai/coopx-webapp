# CoopX + CoopSys — Integrated Cooperative Society Management System

A **React (CoopX) frontend** wired to a **Django REST + scikit-learn backend (CoopSys)**.
Supabase has been completely removed — all data now flows through the Django API.

```
┌────────────────────────┐      HTTP/JSON      ┌─────────────────────────────┐
│  React 19 + TanStack   │  ───────────────►   │  Django 4.2 + DRF           │
│  (Vite, :5173)         │   Token auth        │  REST API  (/api/, :8000)   │
│  shadcn/ui + Tailwind  │  ◄───────────────   │  scikit-learn Random Forest │
└────────────────────────┘                     │  SQLite / MySQL             │
                                               └─────────────────────────────┘
```

---

## What changed vs. the original CoopX

| Original (Supabase)              | Now (Django)                                        |
|----------------------------------|-----------------------------------------------------|
| `supabase.from("table")…`        | Django REST endpoints under `/api/`                 |
| `supabase.auth.*` (Google OAuth) | Token auth: email/password login + signup           |
| Supabase Postgres                | Django ORM → SQLite (dev) / MySQL (prod)            |
| TS `defaultRisk()` heuristic     | Python scikit-learn Random Forest model             |

The 23 route components were **not** rewritten. A small compatibility shim
(`src/integrations/django/client.ts`) exposes the same `.from().select()…` and
`.auth.*` surface, so existing calls keep working while hitting Django.

---

## Prerequisites

- **Python 3.10+**  → https://www.python.org/downloads/
- **Node.js 18+**   → https://nodejs.org/  (comes with npm)

Check they're installed:
```bash
python --version   # or python3 --version
node --version
npm --version
```

---

## Setup — Backend (Django API)

Open a terminal in the project root (`coopx-integrated/`):

```bash
# 1. Create & activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Create the database tables
python manage.py makemigrations
python manage.py migrate

# 4. Seed demo data + train the ML model
python manage.py setup_coopsys

# 5. Start the API server (keep this terminal open)
python manage.py runserver
```

The API is now live at **http://localhost:8000/api/**
(You can also browse it directly — DRF shows a nice interface.)

---

## Setup — Frontend (React app)

Open a **second** terminal in the `frontend/` folder:

```bash
cd frontend

# 1. Install Node dependencies
npm install

# 2. Start the Vite dev server
npm run dev
```

The app is now live at **http://localhost:5173/**

---

## Login credentials (created by `setup_coopsys`)

| Role   | Email                   | Password    |
|--------|-------------------------|-------------|
| Admin  | `admin@coopsys.ng`      | `admin123`  |
| Member | `adebayo@coopsys.ng`    | `member123` |
| Member | `chidinma@coopsys.ng`   | `member123` |
| …      | `<firstname>@coopsys.ng`| `member123` |

---

## Project structure

```
coopx-integrated/
├── manage.py                     ← Django entry point
├── requirements.txt
├── coopsys/                      ← Django project settings
│   ├── settings.py               (DRF + CORS configured)
│   └── urls.py                   (mounts /api/)
├── cooperative/                  ← Django app
│   ├── models.py                 (Member, Loan, Savings, …)
│   ├── serializers.py            ← NEW: JSON shapes for the React app
│   ├── api_views.py              ← NEW: all REST endpoints
│   ├── api_urls.py               ← NEW: /api/ routes
│   ├── ml/predictor.py           (Random Forest)
│   └── management/commands/
│       └── setup_coopsys.py      ← seed + train
└── frontend/                     ← React (CoopX) app
    ├── .env                      (VITE_API_URL=http://localhost:8000/api)
    └── src/
        ├── integrations/
        │   ├── django/client.ts  ← NEW: Supabase-compatible shim → Django
        │   └── supabase/client.ts← now re-exports the Django shim
        ├── lib/
        │   ├── db.ts             (data layer — unchanged API, hits Django)
        │   └── auth.tsx          (uses /api/auth/me/)
        └── routes/               (23 route files — unchanged)
```

---

## API endpoints (quick reference)

```
POST   /api/auth/login/            email + password → token
POST   /api/auth/signup/           create member account
GET    /api/auth/me/               current user + roles + profile
GET    /api/profiles/              members (admin) / own (member)
PATCH  /api/profiles/<id>/status/  approve / suspend a member
GET    /api/loans/                 loans list
POST   /api/loans/apply/           submit application (auto ML risk score)
PATCH  /api/loans/<id>/decide/     approve / reject / disburse
GET    /api/savings/               savings transactions
POST   /api/savings/add/           record contribution / withdrawal
GET    /api/notifications/         user notifications
GET    /api/announcements/         announcements
GET    /api/audit/                 audit log (admin)
GET    /api/settings/              cooperative settings
GET    /api/ml/metrics/            model performance
GET    /api/ml/predict/<id>/       live risk prediction
POST   /api/ml/retrain/            retrain the model
GET    /api/stats/                 dashboard aggregates
```

---

## Troubleshooting

- **CORS / network errors in the browser** → make sure the Django server
  (`python manage.py runserver`) is running on port 8000.
- **"Invalid credentials"** → run `python manage.py setup_coopsys` to create
  the demo accounts.
- **Frontend can't reach API** → confirm `frontend/.env` has
  `VITE_API_URL=http://localhost:8000/api` and restart `npm run dev`.
- **Port already in use** → run Django on another port:
  `python manage.py runserver 8001` and update `VITE_API_URL` accordingly.
```
