from django.contrib import admin
from .models import ReviewerSubjectArea

@admin.register(ReviewerSubjectArea)
class ReviewerSubjectAreaAdmin(admin.ModelAdmin):
    list_display = ('reviewer', 'subject_area')
    list_filter = ('subject_area',)
    search_fields = ('reviewer__username', 'reviewer__first_name', 'reviewer__last_name', 'subject_area')
