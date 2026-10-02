# UniPub

University publication repository with a Django REST API and React/Vite frontend.

## Requirements

- Python 3.13 or newer
- Node.js 20 or newer

## Backend setup

From `BACKEND`, create and activate a virtual environment, then install dependencies and migrate the database:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Set `DJANGO_SECRET_KEY` and `UNIPUB_ADMIN_PASSWORD` as process environment variables before running the server. `.env.example` lists the required names and is not loaded automatically by Django. In PowerShell, for example:

```powershell
$env:DJANGO_SECRET_KEY = "<a generated random secret>"
$env:UNIPUB_ADMIN_PASSWORD = "<your strong admin password>"
```

```powershell
python manage.py migrate
python manage.py runserver
```

## Frontend setup

From `frontend`:

```sh
npm install
npm run dev
```

The frontend API client currently targets `http://localhost:8000/api/`.

## Local data

SQLite databases, uploaded publication files, environment files, Python caches, and frontend build/dependency directories are intentionally excluded from Git. Use migrations to create a fresh local database. The University identity directory is simulated data generated from the administrator portal.