# 🚀 ProductixAI — Setup Guide on a New PC (via GitHub)

> Complete step-by-step guide to clone, run, and license the ProductixAI project on a fresh machine.

---

## 📋 Prerequisites — Install These First

| Tool | Version | Download |
|------|---------|----------|
| **Git** | Latest | https://git-scm.com/downloads |
| **Python** | **3.11** (exact) | https://www.python.org/downloads/release/python-3119/ |
| **Node.js** | v18+ (LTS) | https://nodejs.org/ |
| **npm** | Comes with Node.js | — |

> [!IMPORTANT]
> During Python install, check **"Add Python to PATH"** before clicking Install.

---

## 📁 Project Structure Overview

```
ProductixAI/
├── productix_fastapi/        ← Python FastAPI Backend
│   ├── app/
│   │   ├── main1.py          ← FastAPI app entry point
│   │   ├── models.py
│   │   ├── database.py
│   │   └── .env              ← 🔐 Backend secrets (you must create this)
│   ├── alembic/              ← DB migrations
│   └── alembic.ini
├── project/                  ← React + Vite Frontend
│   ├── src/
│   ├── package.json
│   └── .env                  ← 🔐 Frontend env (you must create this)
├── setup_superadmin.py       ← Creates database tables and structures
├── requirements.txt          ← Python dependencies
└── launcher.py               ← Standard app launcher (runs frontend & backend together)
```

---

## 🔧 Step 1 — Clone the Repository

Open **PowerShell** or **Command Prompt** and run:

```powershell
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd ProductixAI
```

> [!NOTE]
> Replace `YOUR_USERNAME/YOUR_REPO_NAME` with the actual GitHub repository URL.

---

## 🐍 Step 2 — Set Up Python Backend

### 2a. Create a Virtual Environment

```powershell
# Inside the root ProductixAI folder:
python -m venv venv_fastapi
```

### 2b. Activate the Virtual Environment

```powershell
# Windows PowerShell:
.\venv_fastapi\Scripts\Activate.ps1

# Windows CMD:
venv_fastapi\Scripts\activate.bat
```

You should see `(venv_fastapi)` at the start of your terminal prompt.

### 2c. Install Python Dependencies

```powershell
pip install -r requirements.txt
```

---

## 🔐 Step 3 — Create Environment Files

> [!WARNING]
> `.env` files are **NOT** included in the GitHub repo (they are gitignored for security). You must create them manually.

### 3a. Backend `.env` — create at `productix_fastapi/app/.env`

Create a new file at `productix_fastapi/app/.env` with this content:

```env
# Email settings (used for sending verification emails)
EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com

# Frontend & Backend URLs
FRONTEND_VERIFY_URL=http://localhost:5173/verify-result
BACKEND_VERIFY_ENDPOINT=http://127.0.0.1:8000/verify-email

# AI API Keys
GOOGLE_API_KEY=your-google-gemini-api-key
GROQ_API_KEY=your-groq-api-key

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres

# Licensing
CENTRAL_LICENSE_SERVER_URL=https://license.techohub.net
LICENSE_SIGNING_KEY=PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT
PRODUCTIX_ENFORCE_CLIENT_LICENSING=true
```

### 3b. Frontend `.env` — create at `project/.env`

Create a new file at `project/.env` with this content:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## 🗄️ Step 4 — Initialize Database and Configure Global License Server

The database must be initialized first, but actual user logins and licenses are managed through the central licensing system.

### 4a. Create the Database Tables
Run the database setup script to generate tables in Supabase:
```powershell
python setup_superadmin.py
```
*(This command configures the DB tables and default schema. You do not need to use the local `superadmin@productix.ai` ID to log in; instead, we will use the licensing server accounts.)*

### 4b. Register Orgs & Licenses on the PHP License Portal
To register a new organization or user for the app, log into the global admin panel:
1. Open your browser and go to: **[https://license.techohub.net/admin/login.php](https://license.techohub.net/admin/login.php)**
2. Log in using the following Administrator credentials:
   - **Username:** `admin`
   - **Password:** `AdminProductix2026`
3. Use the admin panel to:
   - Create or register a new client Organization.
   - Generate active license keys.
   - Register or add the Organization Admin user accounts.

When users log into ProductixAI locally, the system automatically checks these credentials and organization licenses against this central PHP portal.

---

## ⚡ Step 5 — Set Up the Frontend

Open a new terminal window, navigate to the frontend directory, and install dependencies:

```powershell
# Navigate to the frontend folder
cd project

# Install all Node.js dependencies
npm install
```

---

## ▶️ Step 6 — Run the Application

You can run the application in **one of two ways**:

### 🛠️ Option A: Standalone Launcher (Recommended & Easiest)
The `launcher.py` script starts the backend and automatically opens the frontend app in your default browser. 

> [!IMPORTANT]
> Because `launcher.py` serves the frontend's compiled files directly, you must build the frontend **once** before running it.

1. **Build the frontend assets** (in your frontend terminal):
   ```powershell
   cd project
   npm run build
   ```
2. **Run the launcher** (in your main/backend terminal with `venv_fastapi` active):
   ```powershell
   # Make sure you are in the root ProductixAI/ folder
   python launcher.py
   ```
3. The server will start, detect a free port, and automatically launch your browser to the correct page!

---

### 💻 Option B: Live Development Mode (Dual Terminals)
Use this option if you plan to make changes to the React code and want to see updates live (Hot Module Replacement).

**Terminal 1 — Backend (FastAPI):**
```powershell
# From root ProductixAI/ folder, with venv active:
.\venv_fastapi\Scripts\Activate.ps1
cd productix_fastapi
uvicorn app.main1:app --reload --host 127.0.0.1 --port 8000
```
✅ Backend running at: **http://127.0.0.1:8000**

**Terminal 2 — Frontend (React Vite Server):**
```powershell
# From project/ folder:
cd project
npm run dev
```
✅ Frontend running at: **http://localhost:5173**

---

## 🌐 Step 7 — Log In and Test

1. Open your browser to the application address.
2. Use the credentials you set up or registered in the **PHP License Server Admin Panel** (Step 4b) to log in.
3. The app will communicate with `https://license.techohub.net` to validate the user and licensing status on demand.

---

## 🛠️ Troubleshooting

### ❌ `launcher.py` fails with: `[ERROR] Frontend dist not found`
You forgot to run the build command. Go to the `project/` folder and run `npm run build` first to compile the frontend assets.

### ❌ `uvicorn` or `python` not recognized
- Make sure your virtual environment is activated: `.\venv_fastapi\Scripts\Activate.ps1`
- Reinstall Python 3.11 and check **"Add Python to PATH"** during installation.

### ❌ Database connection error
- Verify `DATABASE_URL` in `productix_fastapi/app/.env` is correct.
- Check your internet connection (Supabase is cloud-hosted).

---

## 📦 Quick Reference — Standalone Launcher Mode Setup

```powershell
# 1. Clone & enter repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd ProductixAI

# 2. Setup Python environment
python -m venv venv_fastapi
.\venv_fastapi\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Create .env files (Step 3)

# 4. Initialize Database
python setup_superadmin.py

# 5. Build Frontend Assets
cd project
npm install
npm run build
cd ..

# 6. Launch Application
.\venv_fastapi\Scripts\Activate.ps1
python launcher.py
```

---

*Setup guide generated for ProductixAI — July 2026*
