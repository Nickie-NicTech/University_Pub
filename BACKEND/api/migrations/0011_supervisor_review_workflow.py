import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def convert_legacy_review_data(apps, schema_editor):
    UserProfile = apps.get_model('api', 'UserProfile')
    Publication = apps.get_model('api', 'Publication')
    UserProfile.objects.filter(role='REVIEWER').update(role='LECTURER')
    Publication.objects.filter(review_status='REJECTED').update(review_status='REVISION_REQUESTED')
    Publication.objects.filter(review_status='PENDING').update(review_status='PENDING_INVITATIONS')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_reformat_unclaimed_university_ids'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(convert_legacy_review_data, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='publication',
            name='review_status',
            field=models.CharField(
                choices=[
                    ('PENDING_INVITATIONS', 'Waiting for invited reviewers'),
                    ('PENDING', 'Pending review'),
                    ('REVIEWER_DECLINED', 'All invited reviewers declined'),
                    ('REVISION_REQUESTED', 'Revisions requested'),
                    ('APPROVED', 'Approved'),
                ],
                default='PENDING_INVITATIONS',
                max_length=20,
            ),
        ),
        migrations.RenameField(
            model_name='publication',
            old_name='rejection_reason',
            new_name='review_feedback',
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[('STUDENT', 'Student'), ('LECTURER', 'Lecturer'), ('ADMIN', 'Administrator')],
                default='STUDENT',
                max_length=20,
            ),
        ),
        migrations.DeleteModel(
            name='ReviewerApplication',
        ),
        migrations.CreateModel(
            name='PublicationReviewInvitation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('SUPERVISOR', 'Supervisor'), ('CO_SUPERVISOR', 'Co-supervisor')], max_length=20)),
                ('status', models.CharField(choices=[('INVITED', 'Invitation pending'), ('ACCEPTED', 'Accepted'), ('DECLINED', 'Declined')], default='INVITED', max_length=10)),
                ('decision', models.CharField(choices=[('PENDING', 'Review pending'), ('APPROVED', 'Approved'), ('REVISION_REQUESTED', 'Revisions requested')], default='PENDING', max_length=20)),
                ('feedback', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('publication', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review_invitations', to='api.publication')),
                ('reviewer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='publication_review_invitations', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['created_at', 'pk']},
        ),
        migrations.AddConstraint(
            model_name='publicationreviewinvitation',
            constraint=models.UniqueConstraint(fields=('publication', 'reviewer'), name='unique_publication_reviewer_invitation'),
        ),
        migrations.AddConstraint(
            model_name='publicationreviewinvitation',
            constraint=models.UniqueConstraint(fields=('publication', 'role'), name='unique_publication_reviewer_role'),
        ),
        migrations.CreateModel(
            name='UserNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('message', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
