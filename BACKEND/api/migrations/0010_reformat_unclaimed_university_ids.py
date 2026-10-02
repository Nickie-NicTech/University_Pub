from django.db import migrations
from django.utils import timezone


def reformat_unclaimed_ids(apps, schema_editor):
    DirectoryEntry = apps.get_model('api', 'UniversityDirectoryEntry')
    year = str(timezone.now().year)
    student_entries = DirectoryEntry.objects.filter(person_type='STUDENT', claimed_by__isnull=True).order_by('pk')
    student_sequence = 1
    for entry in student_entries:
        if len(entry.university_id) == 9 and entry.university_id.isdigit():
            continue
        while DirectoryEntry.objects.filter(university_id=f'{year}{student_sequence:05d}').exclude(pk=entry.pk).exists():
            student_sequence += 1
        entry.university_id = f'{year}{student_sequence:05d}'
        entry.email = f'{entry.university_id}@ub.ac.bw'
        entry.save(update_fields=['university_id', 'email'])
        student_sequence += 1

    employee_entries = DirectoryEntry.objects.filter(person_type='LECTURER', claimed_by__isnull=True).order_by('pk')
    employee_sequence = 10_000_001
    for entry in employee_entries:
        if len(entry.university_id) == 8 and entry.university_id.isdigit() and entry.university_id[0] in {'1', '2'}:
            continue
        while DirectoryEntry.objects.filter(university_id=f'{employee_sequence:08d}').exclude(pk=entry.pk).exists():
            employee_sequence += 1
            if employee_sequence > 19_999_999:
                employee_sequence = 20_000_000
        entry.university_id = f'{employee_sequence:08d}'
        entry.email = f'{entry.university_id}@ub.ac.bw'
        entry.save(update_fields=['university_id', 'email'])
        employee_sequence += 1


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0009_universitydirectoryentry'),
    ]

    operations = [
        migrations.RunPython(reformat_unclaimed_ids, migrations.RunPython.noop),
    ]