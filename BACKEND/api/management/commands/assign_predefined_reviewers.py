
from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import UniversityDirectoryEntry


class Command(BaseCommand):
    help = "Assign predefined reviewers to existing university records."

    @transaction.atomic
    def handle(self, *args, **options):
        lecturers = list(
            UniversityDirectoryEntry.objects.filter(
                person_type="LECTURER",
                is_active=True,
            ).order_by("university_id")
        )

        if len(lecturers) < 2:
            raise ValueError("At least two active lecturers are required.")

        records = UniversityDirectoryEntry.objects.filter(
            is_active=True,
            assigned_reviewer__isnull=True,
        ).order_by("university_id")

        assigned = 0

        for record in records:
            eligible = [
                lecturer for lecturer in lecturers
                if lecturer.pk != record.pk
            ]

            # Prefer a lecturer from the same department.
            same_department = [
                lecturer for lecturer in eligible
                if lecturer.department == record.department
            ]

            candidates = same_department or eligible

            # Deterministic assignment using university ID.
            index = sum(ord(char) for char in record.university_id)
            reviewer = candidates[index % len(candidates)]

            record.assigned_reviewer = reviewer
            record.save(update_fields=["assigned_reviewer"])
            assigned += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Assigned {assigned} records. "
                f"Total assigned: "
                f"{UniversityDirectoryEntry.objects.filter(assigned_reviewer__isnull=False).count()}"
            )
        )
