# UniPub

University publication repository with a Django REST API and React/Vite frontend.

CSI605 team project, Group 2, Department of Computer Science, Faculty of Science, University of Botswana.

## Documentation

Project documentation, including requirements, analysis and design, increments, testing and traceability, is in the [`docs/`](docs/) folder:

| Document | Contents |
| --- | --- |
| [`docs/UNIPUB_Final_Submission.docx`](docs/UNIPUB_Final_Submission.docx) | Requirements, analysis and design, Increments 1 and 2, final enhancements, testing and traceability |
| [`docs/CONTRIBUTIONS.md`](docs/CONTRIBUTIONS.md) | Who did what on the project |

## Team

| Name | Student number |
| --- | --- |
| Lebogang Keiponye | 201704706 |
| Mmoloki Morebodi | 201701407 |
| Thabo Motlhagodi | 201704563 |
| Popagano Batendi | 201006068 |
| Onalenna Sarefo | 202606780 |
| Zenzo Maeza | 202003829 |

## Requirements

* Python 3.13 or newer
* Node.js 20 or newer

## Backend setup

From `BACKEND`, create and activate a virtual environment, then install dependencies and migrate the database:

```
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Set `DJANGO_SECRET_KEY` and `UNIPUB_ADMIN_PASSWORD` as process environment variables before running the server. `.env.example` lists the required names and is not loaded automatically by Django. In PowerShell, for example:

```
$env:DJANGO_SECRET_KEY = "<a generated random secret>"
$env:UNIPUB_ADMIN_PASSWORD = "admin"
```

Configure `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` to enable supervisor and submitter email notifications. Email is sent when a publication is submitted or resubmitted, revisions are requested, or a publication is approved.

```
python manage.py migrate
python manage.py runserver
```

## Frontend setup

From `frontend`:

```
npm install
npm run dev
```

The frontend API client currently targets `http://localhost:8000/api/`.

## Supervisor review workflow

Students and lecturers submit a manuscript PDF with each new publication; an existing manuscript is kept when editing unless it is replaced. Lecturers can provide their skills and expertise in their profile. On submission, the system ranks active lecturers using regex-tokenized subject terms, approximate spelling matches, profile skills, departments, and existing mappings, then automatically assigns the top eligible lecturer and saves the inferred subject mapping for reuse. Administrators can add mappings or remove one to exclude that lecturer from automatic matching for the subject until they explicitly map them again. Each assigned lecturer receives an invitation and can accept or decline it. Lecturers open assigned manuscripts and the Review desk from their review notifications. An accepted reviewer can submit a decision immediately, even while another invitation is unanswered. The final outcome waits until all invitations are answered and every accepted reviewer has decided: all accepted reviewers must approve for publication, while revision feedback from any accepted reviewer requests changes. Declined invitations do not block the remaining accepted reviewers. Review requests and decisions are also sent as in-app notifications and email; clicking a revision notification takes the owner to the publication in their repository.

After upgrading an existing database, run migrations. Legacy reviewer accounts are converted to lecturers by the migration.

## Repository search

Signed-in users see their own publications in the repository list by default; the highlights show the latest approved repository publications. Searching or applying a filter opens matching repository results, subject to publication visibility permissions. The repository search supports title, abstract, author names, and subject areas in any combination, with additional filters for publication type, author name, and subject area.

## Administrator portal

The administrator portal manages users, subject mappings, broadcasts and the simulated university directory. Its Overview tab shows users by type and publications by type (total, approved and not yet approved), and an **Extract PDF report** button downloads the same summary as a PDF.

## Local data

SQLite databases, uploaded publication files, environment files, Python caches, and frontend build/dependency directories are intentionally excluded from Git. Use migrations to create a fresh local database. The University identity directory is simulated data generated from the administrator portal.

## Project status

See the "Open items" section of `docs/UNIPUB_Final_Submission.docx` for what is complete, partly complete and not implemented.
