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

Set `DJANGO_SECRET_KEY` and `UNIPUB_ADMIN_PASSWORD` as process environment variables before running the server. `.env.example` lists the required names and is not loaded automatically by Django. In PowerShell,

```powershell
$env:DJANGO_SECRET_KEY = "<a generated random secret>"
$env:UNIPUB_ADMIN_PASSWORD = "admin"
```

Configured `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL`(in deployment site) which enables supervisor and submitter email notifications. Email is sent when a publication is submitted or resubmitted, revisions are requested, or a publication is approved.

### Google Apps Script mail integration

Google Apps Script was used to  send UniPub notifications through the Gmail account that owns the script. This avoids storing a Gmail app password in Django.



`

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

## Supervisor review workflow

Students and lecturers submit a manuscript PDF with each new publication; an existing manuscript is kept when editing unless it is replaced. Lecturers can provide their skills and expertise in their profile. On submission, the system ranks active lecturers using regex-tokenized subject terms, approximate spelling matches, profile skills, departments, and existing mappings, then automatically assigns the top eligible lecturer and saves the inferred subject mapping for reuse. Administrators can add mappings or remove one to exclude that lecturer from automatic matching for the subject until they explicitly map them again. Each assigned lecturer receives an invitation and can accept or decline it. Lecturers open assigned manuscripts and the **Review desk** from their review notifications. An accepted reviewer can submit a decision immediately, even while another invitation is unanswered. The final outcome waits until all invitations are answered and every accepted reviewer has decided: reviewer must approve for publication, while revision feedback from any accepted reviewer requests changes.   Review requests and decisions are also sent as in-app notifications and email; clicking a revision notification takes the owner to the publication in their repository.

After upgrading an existing database, run migrations. Legacy reviewer accounts are converted to lecturers by the migration.

## Repository search

Signed-in users see their own publications in the repository list by default; the highlights show the latest approved repository publications. Searching or applying a filter opens matching repository results, subject to publication visibility permissions. The repository search supports title, abstract, author names, and subject areas in any combination, with additional filters for publication type, author name, and subject area.

## Local data

SQLite databases, uploaded publication files, environment files, Python caches, and frontend build/dependency directories are intentionally excluded from Git. Use migrations to create a fresh local database. The University identity directory is simulated(SAS) data generated from the administrator portal.