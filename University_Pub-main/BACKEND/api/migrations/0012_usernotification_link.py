from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_supervisor_review_workflow'),
    ]

    operations = [
        migrations.AddField(
            model_name='usernotification',
            name='link',
            field=models.CharField(blank=True, max_length=300),
        ),
    ]
