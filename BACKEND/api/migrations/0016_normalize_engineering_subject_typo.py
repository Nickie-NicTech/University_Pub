import re

from django.db import migrations


ENGINEERING_TYPO_PATTERN = re.compile(r'\b(?:engeneering|engeeneering)\b', re.IGNORECASE)


def normalize_subject_areas(apps, schema_editor):
    ReviewerSubjectArea = apps.get_model('api', 'ReviewerSubjectArea')
    ReviewerSubjectAreaExclusion = apps.get_model('api', 'ReviewerSubjectAreaExclusion')
    database = schema_editor.connection.alias

    def normalized(value):
        return ENGINEERING_TYPO_PATTERN.sub('Engineering', value.strip())

    for model in (ReviewerSubjectArea, ReviewerSubjectAreaExclusion):
        seen = set()
        for record in model.objects.using(database).order_by('pk').iterator():
            subject_area = normalized(record.subject_area)
            key = (record.reviewer_id, subject_area.casefold())
            if key in seen:
                record.delete()
                continue
            seen.add(key)
            if record.subject_area != subject_area:
                record.subject_area = subject_area
                record.save(update_fields=['subject_area'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_reviewersubjectareaexclusion'),
    ]

    operations = [
        migrations.RunPython(normalize_subject_areas, migrations.RunPython.noop),
    ]
