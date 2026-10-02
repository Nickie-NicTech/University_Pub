from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('STUDENT', 'Student'),
        ('LECTURER', 'Lecturer'),
        ('REVIEWER', 'Reviewer'),
        ('ADMIN', 'Administrator'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='STUDENT')
    department = models.CharField(max_length=100)
    profile_picture = models.FileField(upload_to='profiles/', blank=True, null=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class UniversityDirectoryEntry(models.Model):
    PERSON_TYPES = [
        ('STUDENT', 'Student'),
        ('LECTURER', 'Lecturer'),
    ]

    university_id = models.CharField(max_length=32, unique=True)
    person_type = models.CharField(max_length=20, choices=PERSON_TYPES)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    department = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    claimed_by = models.OneToOneField(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='university_directory_entry')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['person_type', 'university_id']

    def __str__(self):
        return f"{self.university_id} - {self.first_name} {self.last_name}"


class AuthorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.SET_NULL, related_name='author_profile', blank=True, null=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    physical_address = models.TextField(blank=True)
    occupation = models.CharField(max_length=150, blank=True)
    department = models.CharField(max_length=100, blank=True)
    institution = models.CharField(max_length=200, default="University of Botswana", blank=True)

    def __str__(self):
        if self.first_name or self.last_name:
            return f"{self.first_name} {self.last_name}".strip()
        return self.user.get_full_name() if self.user else f"Author {self.pk}"

class Publication(models.Model):
    REVIEW_STATUS_CHOICES = [
        ('PENDING', 'Pending review'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    PUBLICATION_TYPES = [
        ('JOURNAL', 'Journal Article'),
        ('CONFERENCE', 'Conference Paper'),
        ('THESIS', 'PhD/MPhil/MSc Thesis'),
        ('DISSERTATION', 'Dissertation'),
    ]

    title = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='owned_publications', blank=True, null=True)
    abstract = models.TextField()
    pub_type = models.CharField(max_length=20, choices=PUBLICATION_TYPES)
    subject_area = models.CharField(max_length=100)
    authors = models.ManyToManyField(AuthorProfile, related_name='publications')
    file_attachment = models.FileField(upload_to='publications/%Y/%m/', blank=True, null=True)
    download_count = models.PositiveIntegerField(default=0)
    upload_date = models.DateTimeField(auto_now_add=True)
    is_approved = models.BooleanField(default=False) # For the verification milestone
    review_status = models.CharField(max_length=20, choices=REVIEW_STATUS_CHOICES, default='PENDING')
    rejection_reason = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        if self.is_approved:
            self.review_status = 'APPROVED'
            self.rejection_reason = ''
        elif self.review_status == 'APPROVED':
            self.review_status = 'PENDING'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class PublicationDeletionRequest(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name='deletion_requests')
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='publication_deletion_requests')
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='PENDING')
    requested_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"Deletion request for {self.publication_id} ({self.status})"


class ReviewerApplication(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviewer_applications')
    expertise = models.CharField(max_length=200)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='reviewed_applications')

    class Meta:
        ordering = ['-created_at']


class BroadcastMessage(models.Model):
    title = models.CharField(max_length=160)
    message = models.TextField()
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='broadcast_messages')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

