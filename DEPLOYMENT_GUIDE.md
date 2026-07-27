# 🌐 Complete Deployment Guide: Vercel, Railway & PHP Licensing Portal

> **ProductixAI Full-Stack Production Deployment Guide**  
> A simple, step-by-step guide designed for complete beginners to deploy the **Frontend on Vercel**, the **Backend on Railway**, and connect the **PHP Licensing Portal**.

---

## 📌 Architecture Overview

Before starting, here is how all pieces of your application communicate in production:

```mermaid
flowchart TD
    User["👤 User / Web Browser"] -->|"1. Visits App"| Vercel["⚡ Vercel (Frontend - React/Vite)"]
    Vercel -->|"2. API Requests (VITE_API_BASE_URL)"| Railway["🚂 Railway (Backend - Python FastAPI)"]
    Railway -->|"3. Read/Write Data"| Supabase[("🗄️ Supabase PostgreSQL DB")]
    Railway -->|"4. Validates License & User Login"| PHPLicense["🔐 PHP License Portal (license.techohub.net)"]
```

1. **Vercel**: Hosts your user interface (`project/` folder).
2. **Railway**: Hosts your API backend (`productix_fastapi/` folder).
3. **Supabase**: Hosts your PostgreSQL database.
4. **PHP Licensing Portal**: Validates organization licenses and authenticates users (`https://license.techohub.net`).

---

## 📋 Prerequisites Checklist

Before you begin, ensure you have created free accounts on these platforms:

- [ ] **GitHub Account**: Your codebase must be pushed to a GitHub repository.
- [ ] **Railway Account**: [railway.app](https://railway.app) (Sign up with GitHub).
- [ ] **Vercel Account**: [vercel.com](https://vercel.com) (Sign up with GitHub).
- [ ] **Supabase Database**: URL and password ready (or whichever PostgreSQL database you use).
- [ ] **PHP Licensing Portal Access**: Admin login details for `https://license.techohub.net/admin/login.php`.

---

## 🚀 Step 1: Push Your Project to GitHub

If your code is not yet on GitHub:

1. Open your terminal in your project root folder (`ProductixAI`).
2. Run the following commands:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for production deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

---

## 🚂 Step 2: Deploy the Backend on Railway

Railway will run your Python FastAPI backend.

### 2.1 Create a New Railway Project
1. Log into **[Railway.app](https://railway.app)**.
2. Click **"+ New Project"**.
3. Select **"Deploy from GitHub repo"**.
4. Select your **`ProductixAI`** repository.
5. Click **"Deploy Now"** (or add environment variables first).

### 2.2 Configure Railway Build & Root Settings
Because your backend lives inside the `productix_fastapi` subfolder:

1. Click on your newly created Service card in Railway.
2. Go to the **"Settings"** tab.
3. Scroll to **"General"**:
   - **Service Name**: Rename it to `productix-backend` (optional).
4. Scroll to **"Build & Deploy"**:
   - **Root Directory**: Set to `productix_fastapi` *(or leave blank if using root `railway.json`)*.
   - **Custom Start Command**:  
     ```bash
     cd productix_fastapi && python -m uvicorn app.main1:app --host 0.0.0.0 --port $PORT
     ```
     *(Note: If Root Directory is set to `productix_fastapi`, use: `python -m uvicorn app.main1:app --host 0.0.0.0 --port $PORT`)*

### 2.3 Set Backend Environment Variables in Railway
1. Go to the **"Variables"** tab in your Railway service.
2. Click **"Raw Editor"** or **"+ Add Variable"** and add the following keys:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` | Supabase Postgres DB Connection URL |
| `CENTRAL_LICENSE_SERVER_URL` | `https://license.techohub.net` | PHP Licensing Server Base URL |
| `LICENSE_SIGNING_KEY` | `PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT` | Secret Key shared with PHP portal |
| `PRODUCTIX_ENFORCE_CLIENT_LICENSING` | `true` | Enables central license check |
| `CORS_ORIGINS` | `https://your-app-name.vercel.app` | Allowed Frontend Domain(s), comma-separated |
| `EMAIL` | `your-email@gmail.com` | Email for system notifications |
| `EMAIL_PASSWORD` | `xxxx xxxx xxxx xxxx` | Gmail App Password |
| `MAIL_PORT` | `587` | SMTP Port |
| `MAIL_SERVER` | `smtp.gmail.com` | SMTP Host |
| `FRONTEND_VERIFY_URL` | `https://your-app-name.vercel.app/verify-result` | Verification redirect link |
| `BACKEND_VERIFY_ENDPOINT` | `https://your-backend.up.railway.app/verify-email` | Railway backend endpoint |
| `GOOGLE_API_KEY` | `AIzaSy...` | Gemini API Key |
| `GROQ_API_KEY` | `gsk_...` | Groq API Key |

3. Click **"Save and Deploy"**.

### 2.4 Generate Railway Public Domain
1. Go to the **"Settings"** tab in Railway.
2. Scroll to **"Networking"** -> **"Public Networking"**.
3. Click **"Generate Domain"**.
4. Railway will create a domain like:  
   `https://productix-backend-production.up.railway.app`
5. 📝 **COPY THIS URL!** You will need it for Vercel.

---

## ⚡ Step 3: Deploy the Frontend on Vercel

Vercel will build and host your React + Vite frontend.

### 3.1 Import Project to Vercel
1. Log into **[Vercel.com](https://vercel.com)**.
2. Click **"Add New..."** -> **"Project"**.
3. Select your **`ProductixAI`** GitHub repository.

### 3.2 Configure Vercel Build Settings
1. **Framework Preset**: Select **Vite**.
2. **Root Directory**: Click **Edit** and select the **`project`** folder.
3. **Build Command**: `npm run build` *(Auto-detected)*
4. **Output Directory**: `dist` *(Auto-detected)*
5. **Install Command**: `npm install` *(Auto-detected)*

### 3.3 Set Frontend Environment Variables in Vercel
1. Expand the **"Environment Variables"** section.
2. Add the following variable:

| Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://productix-backend-production.up.railway.app` | Your Railway Backend Public URL |

> [!IMPORTANT]
> Do **NOT** put a trailing slash `/` at the end of the URL (e.g. use `https://productix-backend-production.up.railway.app`, not `...app/`).

3. Click **"Deploy"**.
4. Wait 1–2 minutes for the build to finish. Vercel will grant you a public domain, such as:  
   `https://productix-frontend.vercel.app`

---

## 🔗 Step 4: Connect Frontend & Backend (CORS Configuration)

Now that both servers are live, we must permit the Frontend domain to speak with the Backend domain.

### 4.1 Update Railway CORS Variable
1. Go back to **Railway** -> Your Service -> **Variables**.
2. Update the `CORS_ORIGINS` variable:
   ```env
   CORS_ORIGINS=https://productix-frontend.vercel.app
   ```
   *(If you have custom domains, separate them with commas: `https://productix-frontend.vercel.app,https://myapp.com`)*
3. Also update `FRONTEND_VERIFY_URL` if needed:
   ```env
   FRONTEND_VERIFY_URL=https://productix-frontend.vercel.app/verify-result
   ```
4. Click **Deploy / Save**. Railway will automatically redeploy the backend with the new origins.

---

## 🔑 Step 5: Connect the PHP Licensing Portal

Your FastAPI backend verifies organization credentials and license status directly against the central PHP server.

### 5.1 How the Integration Works
When a user logs into your Vercel frontend:
1. Frontend sends login request to **Railway FastAPI Backend** (`/login`).
2. Backend makes an HTTPS call to `CENTRAL_LICENSE_SERVER_URL` (`https://license.techohub.net/api/validate.php` or `/api/login.php`).
3. PHP Licensing Server checks database records for:
   - Valid Organization
   - Active License Key (Expiry date check)
   - Valid User credentials
4. PHP server returns a signed response. Backend grants access token to Frontend.

### 5.2 Configuring the PHP Licensing Portal (cPanel / Hosting Server)
If hosting your PHP Licensing Portal on a server (e.g., cPanel, Apache/Nginx with PHP & MySQL):

1. **Upload Files**: Place all files from `licensing-server/` onto your PHP web host (e.g. `public_html` or domain root `license.techohub.net`).
2. **Database Setup**:
   - Create a MySQL database in cPanel (e.g. `techohub_licensing`).
   - Import `licensing-server/schema.sql` into MySQL via phpMyAdmin.
3. **Database Configuration (`db_config.php`)**:
   Edit `licensing-server/db_config.php` with your MySQL credentials and signing key:
   ```php
   <?php
   define('DB_HOST', 'localhost');
   define('DB_USER', 'your_db_username');
   define('DB_PASS', 'your_db_password');
   define('DB_NAME', 'techohub_licensing');
   
   // Signing key MUST match Railway LICENSE_SIGNING_KEY
   define('LICENSE_SIGNING_KEY', 'PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT');
   ?>
   ```

### 5.3 Managing Organizations & Users via Admin Portal
1. Open your browser to: **`https://license.techohub.net/admin/login.php`**
2. Log in with Admin credentials:
   - **Username**: `admin`
   - **Password**: `AdminProductix2026` *(or your custom admin password)*
3. **Register New Client/Organization**:
   - Add Organization Name and License Type.
   - Generate an **Active License Key**.
   - Create Organization Admin Users.
4. When users log into your Vercel web app, they will use these exact credentials!

---

## 🔍 Step 6: Testing & Verification

1. Open your Vercel URL (`https://productix-frontend.vercel.app`).
2. Open Browser Developer Tools (`F12` -> **Network** tab).
3. Attempt to log in with credentials registered in the PHP Licensing Admin panel.
4. Check Network requests:
   - Request goes to `https://productix-backend-production.up.railway.app/login/`.
   - Response status is `200 OK`.
   - Authorization headers and tokens are saved in browser state.

---

## 🛠️ Common Issues & Troubleshooting

### 1. `Failed to Fetch` or `CORS Error` in Browser Console
- **Cause**: The backend is blocking requests from the frontend domain.
- **Fix**: Check `CORS_ORIGINS` in Railway environment variables. Make sure it contains `https://your-app.vercel.app` without trailing slashes.

### 2. 404 Page Not Found on Refresh (Vercel SPA Routing)
- **Cause**: Client-side routing fails when refreshing non-root pages (e.g., `/dashboard`).
- **Fix**: Ensure `project/vercel.json` exists with single-page app rewrite configuration:
  ```json
  {
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "installCommand": "npm install",
    "rewrites": [
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

### 3. Backend Returns `500 Internal Server Error`
- **Cause**: Database URL incorrect or missing environment variables on Railway.
- **Fix**: Open Railway -> Service -> **"Logs"** tab to inspect full python error stack trace.

### 4. `License Expired` or `Invalid Organization License`
- **Cause**: `CENTRAL_LICENSE_SERVER_URL` unreachable, or license key inactive/expired.
- **Fix**: Log into `https://license.techohub.net/admin/login.php` and verify the client organization license status is active.

---

## 📑 Summary Checklist of Environment Variables

### Railway (Backend Variables)
```env
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
CENTRAL_LICENSE_SERVER_URL=https://license.techohub.net
LICENSE_SIGNING_KEY=PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT
PRODUCTIX_ENFORCE_CLIENT_LICENSING=true
CORS_ORIGINS=https://productix-frontend.vercel.app
EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
FRONTEND_VERIFY_URL=https://productix-frontend.vercel.app/verify-result
BACKEND_VERIFY_ENDPOINT=https://productix-backend.up.railway.app/verify-email
GOOGLE_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

### Vercel (Frontend Variables)
```env
VITE_API_BASE_URL=https://productix-backend.up.railway.app
```

---
*Deployment Guide for ProductixAI — Vercel & Railway Production setup.*
