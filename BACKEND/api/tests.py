from django.test import TestCase
from django.urls import reverse
from django.core.exceptions import ValidationError
from datetime import datetime
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework_simplejwt.tokens import AccessToken
import re
from .models import AuthorProfile, Publication, PublicationDeletionRequest, PublicationReviewInvitation, PublicationVersion, ReviewerSubjectArea, UserNotification, UserProfile, UniversityDirectoryEntry, BroadcastMessage
from .serializers import RepositoryTokenObtainPairSerializer

class TokenClaimsTests(TestCase):
    def test_token_includes_username_and_profile_role(self):
        user = User.objects.create_user(username='lecturer', password='test-password')
        UserProfile.objects.create(user=user, role='LECTURER', department='Computer Science')

        token = RepositoryTokenObtainPairSerializer.get_token(user)

        self.assertEqual(token['username'], 'lecturer')
        self.assertEqual(token['role'], 'LECTURER')

    def test_token_without_profile_uses_member_role(self):
        user = User.objects.create_user(username='legacy-user', password='test-password')

        token = RepositoryTokenObtainPairSerializer.get_token(user)

        self.assertEqual(token['username'], 'legacy-user')
        self.assertEqual(token['role'], 'STUDENT')
        self.assertTrue(UserProfile.objects.filter(user=user).exists())


class JwtLifetimeTests(APITestCase):
    def test_access_token_lifetime_is_thirty_minutes(self):
        User.objects.create_user(username='jwt-lifetime-user', password='test-password')

        response = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'jwt-lifetime-user', 'password': 'test-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        access_token = AccessToken(response.data['access'])
        self.assertEqual(access_token['exp'] - access_token['iat'], 30 * 60)

    def test_refresh_endpoint_issues_a_new_access_token(self):
        User.objects.create_user(username='jwt-refresh-user', password='test-password')
        tokens = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'jwt-refresh-user', 'password': 'test-password'},
            format='json',
        )

        refreshed = self.client.post(
            reverse('token_refresh'),
            {'refresh': tokens.data['refresh']},
            format='json',
        )

        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        AccessToken(refreshed.data['access'])


class SubjectMappingManagementTests(APITestCase):
    def test_admin_can_assign_student_directory_entry_to_lecturer(self):
        admin = User.objects.create_superuser(username='student-mapping-admin', password='test-password')
        student = UniversityDirectoryEntry.objects.create(
            university_id='202600101',
            person_type='STUDENT',
            first_name='Student',
            last_name='One',
            email='student.one@example.com',
            department='Computing',
        )
        lecturer = UniversityDirectoryEntry.objects.create(
            university_id='10000001',
            person_type='LECTURER',
            first_name='Ada',
            last_name='Lovelace',
            email='ada.lecturer@example.com',
            department='Computing',
        )
        self.client.force_authenticate(user=admin)

        assigned = self.client.patch(
            reverse('admin_university_directory_assignment', args=[student.pk]),
            {'assigned_reviewer': lecturer.pk},
            format='json',
        )

        self.assertEqual(assigned.status_code, status.HTTP_200_OK, assigned.data)
        self.assertEqual(assigned.data['assigned_reviewer_id'], lecturer.pk)
        self.assertEqual(assigned.data['assigned_reviewer_name'], 'Ada Lovelace')
        student.refresh_from_db()
        self.assertEqual(student.assigned_reviewer_id, lecturer.pk)

        listed = self.client.get(reverse('admin_university_directory'))
        student_entry = next(item for item in listed.data if item['id'] == student.pk)
        self.assertEqual(student_entry['assigned_reviewer_id'], lecturer.pk)

        cleared = self.client.patch(
            reverse('admin_university_directory_assignment', args=[student.pk]),
            {'assigned_reviewer': None},
            format='json',
        )
        self.assertEqual(cleared.status_code, status.HTTP_200_OK, cleared.data)
        self.assertIsNone(cleared.data['assigned_reviewer_id'])

    def test_student_lecturer_mapping_requires_admin_and_active_lecturer(self):
        student = UniversityDirectoryEntry.objects.create(
            university_id='202600102',
            person_type='STUDENT',
            first_name='Student',
            last_name='Two',
            email='student.two@example.com',
            department='Computing',
        )
        inactive_lecturer = UniversityDirectoryEntry.objects.create(
            university_id='10000002',
            person_type='LECTURER',
            first_name='Inactive',
            last_name='Lecturer',
            email='inactive.lecturer@example.com',
            department='Computing',
            is_active=False,
        )
        self.client.force_authenticate(user=User.objects.create_user(username='student-mapping-user'))

        forbidden = self.client.patch(
            reverse('admin_university_directory_assignment', args=[student.pk]),
            {'assigned_reviewer': inactive_lecturer.pk},
            format='json',
        )
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        admin = User.objects.create_superuser(username='student-mapping-validator', password='test-password')
        self.client.force_authenticate(user=admin)
        invalid_lecturer = self.client.patch(
            reverse('admin_university_directory_assignment', args=[student.pk]),
            {'assigned_reviewer': inactive_lecturer.pk},
            format='json',
        )
        self.assertEqual(invalid_lecturer.status_code, status.HTTP_400_BAD_REQUEST)


    def test_lecturer_can_save_skills_on_their_profile(self):
        lecturer = User.objects.create_user(username='skillset-lecturer', password='test-password')
        UserProfile.objects.create(user=lecturer, role='LECTURER', department='Computing')
        self.client.force_authenticate(user=lecturer)

        updated = self.client.patch(
            reverse('current_user_profile'),
            {'skillset': 'Software engineering, distributed systems'},
            format='json',
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data['skillset'], 'Software engineering, distributed systems')

    def test_admin_can_create_list_and_remove_lecturer_subject_mappings(self):
        admin = User.objects.create_superuser(username='mapping-admin', password='test-password')
        lecturer = User.objects.create_user(
            username='mapping-lecturer',
            password='test-password',
            first_name='Ada',
            last_name='Lovelace',
        )
        UserProfile.objects.create(
            user=lecturer,
            role='LECTURER',
            department='Computer Science',
            skillset='Software engineering, databases',
        )
        self.client.force_authenticate(user=admin)
        admin_users = self.client.get(reverse('admin_user_list'))
        lecturer_record = next(item for item in admin_users.data if item['username'] == lecturer.username)
        self.assertEqual(lecturer_record['user_id'], lecturer.id)

        created = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': '  Software Engineering  ', 'reviewer': lecturer.id},
            format='json',
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data['subject_area'], 'Software Engineering')
        self.assertEqual(created.data['reviewer_name'], 'Ada Lovelace')
        self.assertEqual(created.data['skillset'], 'Software engineering, databases')

        duplicate = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': 'software engineering', 'reviewer': lecturer.id},
            format='json',
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        listed = self.client.get(reverse('admin_subject_mapping_list'))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)

        deleted = self.client.delete(
            reverse('admin_subject_mapping_detail', args=[created.data['id']]),
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ReviewerSubjectArea.objects.exists())

    def test_mapping_normalizes_common_engineering_misspellings(self):
        admin = User.objects.create_superuser(username='mapping-spelling-admin', password='test-password')
        lecturer = User.objects.create_user(username='mapping-spelling-lecturer', password='test-password')
        UserProfile.objects.create(user=lecturer, role='LECTURER', department='Computing')
        self.client.force_authenticate(user=admin)

        created = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': 'Software engeneering', 'reviewer': lecturer.id},
            format='json',
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data['subject_area'], 'Software Engineering')
        self.assertEqual(
            ReviewerSubjectArea.objects.get(reviewer=lecturer).subject_area,
            'Software Engineering',
        )

    def test_removed_mapping_excludes_lecturer_from_automatic_matching_until_admin_remaps(self):
        admin = User.objects.create_superuser(username='mapping-exclusion-admin', password='test-password')
        lecturer = User.objects.create_user(username='excluded-mapping-lecturer', password='test-password')
        UserProfile.objects.create(
            user=lecturer,
            role='LECTURER',
            department='Computing',
            skillset='Software engineering',
        )
        fallback = User.objects.create_user(username='fallback-mapping-lecturer', password='test-password')
        UserProfile.objects.create(user=fallback, role='LECTURER', department='Other')
        self.client.force_authenticate(user=admin)

        created = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': 'Software Engineering', 'reviewer': lecturer.id},
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        deleted = self.client.delete(
            reverse('admin_subject_mapping_detail', args=[created.data['id']]),
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

        ranked = self.client.get(
            reverse('supervisor_list'),
            {'subject_area': 'Software Engineering'},
        )
        self.assertEqual(ranked.status_code, status.HTTP_200_OK)
        self.assertNotIn(lecturer.id, [item['user_id'] for item in ranked.data])
        self.assertEqual(ranked.data[0]['user_id'], fallback.id)

        restored = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': 'Software Engineering', 'reviewer': lecturer.id},
            format='json',
        )
        self.assertEqual(restored.status_code, status.HTTP_201_CREATED, restored.data)
        ranked_again = self.client.get(
            reverse('supervisor_list'),
            {'subject_area': 'Software Engineering'},
        )
        self.assertEqual(ranked_again.data[0]['user_id'], lecturer.id)

    def test_subject_mapping_management_requires_admin_and_lecturer(self):
        user = User.objects.create_user(username='mapping-student', password='test-password')
        UserProfile.objects.create(user=user, role='STUDENT', department='Computing')
        self.client.force_authenticate(user=user)

        forbidden = self.client.get(reverse('admin_subject_mapping_list'))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        admin = User.objects.create_superuser(username='mapping-validation-admin', password='test-password')
        self.client.force_authenticate(user=admin)
        invalid_reviewer = self.client.post(
            reverse('admin_subject_mapping_list'),
            {'subject_area': 'Computing', 'reviewer': user.id},
            format='json',
        )
        self.assertEqual(invalid_reviewer.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='unipub@example.com',
)
class PublicationTests(APITestCase):
    valid_abstract = ' '.join(['Academic research abstract content exploring modern institutional repositories and data structures.'] * 16)

    def manuscript_upload(self, filename='manuscript.pdf', content=b'%PDF-1.4 test'):
        return SimpleUploadedFile(filename, content, content_type='application/pdf')

    def create_supervisor(self, username='supervisor'):
        user = User.objects.create_user(
            username=username,
            password='test-password',
            email=f'{username}@example.com',
        )
        profile = UserProfile.objects.create(user=user, role='LECTURER', department='Computer Science')
        ReviewerSubjectArea.objects.get_or_create(reviewer=user, subject_area='Computer Science')
        return user, profile

    def create_member(self, username, supervisor=None, role='STUDENT'):
        user = User.objects.create_user(
            username=username,
            password='test-password',
            email=f'{username}@example.com',
        )
        profile = UserProfile.objects.create(
            user=user,
            role=role,
            department='Computer Science',
        )
        return user, profile


    def assign_predefined_reviewer(self, author, reviewer):
        reviewer_entry, _ = UniversityDirectoryEntry.objects.get_or_create(
            claimed_by=reviewer,
            defaults={
                'university_id': f'1{reviewer.pk:07d}',
                'person_type': 'LECTURER',
                'first_name': reviewer.first_name or 'Test',
                'last_name': reviewer.last_name or 'Lecturer',
                'email': f'reviewer-{reviewer.pk}@example.com',
                'department': 'Computer Science',
            },
        )

        author_entry, _ = UniversityDirectoryEntry.objects.get_or_create(
            claimed_by=author,
            defaults={
                'university_id': f'2026{author.pk:05d}',
                'person_type': 'LECTURER' if author.profile.role == 'LECTURER' else 'STUDENT',
                'first_name': author.first_name or 'Test',
                'last_name': author.last_name or 'Author',
                'email': f'author-{author.pk}@example.com',
                'department': 'Computer Science',
            },
        )

        author_entry.assigned_reviewer = reviewer_entry
        author_entry.save(update_fields=['assigned_reviewer'])
        return author_entry

    def create_review_publication(self, owner, reviewer, **fields):
        publication = Publication.objects.create(
            owner=owner,
            title=fields.pop('title', 'Review test paper'),
            abstract=fields.pop('abstract', 'Abstract'),
            pub_type=fields.pop('pub_type', 'JOURNAL'),
            subject_area=fields.pop('subject_area', 'Computer Science'),
            **fields,
        )
        PublicationReviewInvitation.objects.create(
            publication=publication,
            reviewer=reviewer,
            role='SUPERVISOR',
        )
        return publication

    def test_registration_verifies_directory_id_and_fills_user_profile(self):
        entry = UniversityDirectoryEntry.objects.create(
            university_id='202600123', person_type='STUDENT',
            first_name='Naledi', last_name='Molefe', email='naledi.molefe@ub.ac.bw',
            department='Computer Science',
        )

        response = self.client.post(
            reverse('user_register'),
            {'username': 'naledi123', 'password': 'test-password', 'role': 'STUDENT', 'university_id': entry.university_id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(username='naledi123')
        self.assertEqual((user.first_name, user.last_name, user.email), ('Naledi', 'Molefe', 'naledi.molefe@ub.ac.bw'))
        self.assertEqual(user.profile.department, 'Computer Science')
        entry.refresh_from_db()
        self.assertEqual(entry.claimed_by, user)
        self.assertEqual(response.data['department'], 'Computer Science')

    def test_subject_matched_lecturer_is_first_supervisor_recommendation(self):
        matching_lecturer, _ = self.create_supervisor('matched-subject-lecturer')
        other_lecturer, _ = self.create_supervisor('other-subject-lecturer')
        ReviewerSubjectArea.objects.create(
            reviewer=matching_lecturer,
            subject_area='Artificial Intelligence',
        )

        response = self.client.get(
            reverse('supervisor_list'),
            {'subject_area': 'artificial intelligence'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['user_id'], matching_lecturer.id)
        self.assertTrue(response.data[0]['is_subject_match'])
        other = next(item for item in response.data if item['user_id'] == other_lecturer.id)
        self.assertFalse(other['is_subject_match'])

    
    def test_publication_creation_uses_predefined_reviewer(self):
        reviewer, _ = self.create_supervisor('predefined-reviewer')
        other_reviewer, _ = self.create_supervisor('subject-expert')
        owner, _ = self.create_member('predefined-author')

        reviewer_entry = UniversityDirectoryEntry.objects.create(
            university_id='10000003',
            person_type='LECTURER',
            first_name='Dineo',
            last_name='Ramoabi',
            email='dineo@example.com',
            department='Education',
            claimed_by=reviewer,
        )

        UniversityDirectoryEntry.objects.create(
            university_id='202600005',
            person_type='STUDENT',
            first_name='Naledi',
            last_name='Kgosidintsi',
            email='naledi@example.com',
            department='Education',
            claimed_by=owner,
            assigned_reviewer=reviewer_entry,
        )

        ReviewerSubjectArea.objects.create(
            reviewer=other_reviewer,
            subject_area='Artificial Intelligence',
        )

        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Publication with predefined reviewer',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Artificial Intelligence',
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['supervisor_id'], reviewer.id)
        self.assertIsNone(response.data['co_supervisor_id'])
        self.assertTrue(
            PublicationReviewInvitation.objects.filter(
                publication_id=response.data['id'],
                reviewer=reviewer,
                role='SUPERVISOR',
                status='INVITED',
            ).exists()
        )
        self.assertFalse(ReviewerSubjectArea.objects.filter(
            reviewer=reviewer,
            subject_area='Artificial Intelligence',
        ).exists())

    def test_lecturer_publication_uses_subject_expertise_not_directory_assignment(self):
        matching_reviewer, _ = self.create_supervisor('lecturer-subject-match')
        directory_reviewer, _ = self.create_supervisor('lecturer-directory-assignment')
        owner, _ = self.create_member('lecturer-publication-owner', role='LECTURER')
        self.assign_predefined_reviewer(owner, directory_reviewer)
        ReviewerSubjectArea.objects.create(
            reviewer=matching_reviewer,
            subject_area='Artificial Intelligence',
        )
        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Lecturer expertise matched publication',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Artificial Intelligence',
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['supervisor_id'], matching_reviewer.id)
        self.assertTrue(PublicationReviewInvitation.objects.filter(
            publication_id=response.data['id'],
            reviewer=matching_reviewer,
            role='SUPERVISOR',
            status='INVITED',
        ).exists())
        self.assertFalse(PublicationReviewInvitation.objects.filter(
            publication_id=response.data['id'],
            reviewer=directory_reviewer,
        ).exists())

    def test_lecturer_publication_requires_a_subject_expertise_match(self):
        reviewer, reviewer_profile = self.create_supervisor('nonmatching-lecturer-reviewer')
        reviewer_profile.department = 'Education'
        reviewer_profile.skillset = 'Curriculum design'
        reviewer_profile.save(update_fields=['department', 'skillset'])
        owner, _ = self.create_member('lecturer-without-match', role='LECTURER')
        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Publication without a subject match',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Artificial Intelligence',
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('supervisor', response.data)
        self.assertFalse(Publication.objects.filter(title='Publication without a subject match').exists())

    def test_publication_uses_predefined_reviewer_instead_of_subject_expertise(self):
        matching, matching_profile = self.create_supervisor('expertise-matched-lecturer')
        other, _ = self.create_supervisor('expertise-unmatched-lecturer')
        matching_profile.skillset = 'Software engeneering and databases'
        matching_profile.save(update_fields=['skillset'])
        other.profile.skillset = 'Education and curriculum design'
        other.profile.save(update_fields=['skillset'])
        owner, _ = self.create_member('unmapped-subject-owner')
        self.assign_predefined_reviewer(owner, other)
        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Automatically matched paper',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Software Engineering',
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['supervisor_id'], other.id)
        self.assertTrue(PublicationReviewInvitation.objects.filter(
            publication_id=response.data['id'],
            reviewer=other,
            role='SUPERVISOR',
        ).exists())
        typo_match = self.client.get(
            reverse('supervisor_list'),
            {'subject_area': 'Software engeneering'},
        )
        self.assertEqual(typo_match.status_code, status.HTTP_200_OK)
        self.assertIn(
            matching.id,
            [lecturer['user_id'] for lecturer in typo_match.data],
        )
    def test_publication_creation_requires_a_valid_pdf_manuscript(self):
        supervisor, _ = self.create_supervisor('required-file-supervisor')
        owner, _ = self.create_member('required-file-owner')
        self.assign_predefined_reviewer(owner, supervisor)
        self.client.force_authenticate(user=owner)
        payload = {
            'title': 'Manuscript required',
            'abstract': self.valid_abstract,
            'pub_type': 'JOURNAL',
            'subject_area': 'Computer Science',
        }

        missing = self.client.post(reverse('publication-list'), payload, format='json')
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file_attachment', missing.data)

        invalid = self.client.post(
            reverse('publication-list'),
            {**payload, 'file_attachment': self.manuscript_upload('paper.txt', b'not a PDF')},
            format='multipart',
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file_attachment', invalid.data)

        valid = self.client.post(
            reverse('publication-list'),
            {**payload, 'file_attachment': self.manuscript_upload()},
            format='multipart',
        )
        self.assertEqual(valid.status_code, status.HTTP_201_CREATED, valid.data)
        self.assertEqual(valid.data['supervisor_id'], supervisor.id)

    def test_owner_cannot_reassign_unanswered_predefined_reviewer(self):
        mapped_supervisor, _ = self.create_supervisor('unanswered-mapped-supervisor')
        replacement_supervisor, _ = self.create_supervisor('unanswered-replacement-supervisor')
        owner, _ = self.create_member('unanswered-assignment-owner')
        self.assign_predefined_reviewer(owner, mapped_supervisor)
        ReviewerSubjectArea.objects.create(reviewer=mapped_supervisor, subject_area='Data Science')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Unanswered review assignment',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Data Science',
                'file_attachment': self.manuscript_upload(),            },
            format='multipart',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        updated = self.client.patch(
            reverse('publication-detail', args=[created.data['id']]),
            {'supervisor': replacement_supervisor.id},
            format='json',
        )

        self.assertEqual(updated.status_code, status.HTTP_400_BAD_REQUEST, updated.data)
        self.assertTrue(PublicationReviewInvitation.objects.filter(
            publication_id=created.data['id'],
            reviewer=mapped_supervisor,
        ).exists())
        self.assertFalse(PublicationReviewInvitation.objects.filter(
            publication_id=created.data['id'],
            reviewer=replacement_supervisor,
        ).exists())

    def test_owner_cannot_replace_declined_predefined_reviewer(self):        
        declined_supervisor, _ = self.create_supervisor('declined-mapped-supervisor')
        replacement_supervisor, _ = self.create_supervisor('declined-replacement-supervisor')
        owner, _ = self.create_member('declined-assignment-owner')
        self.assign_predefined_reviewer(owner, declined_supervisor)
        ReviewerSubjectArea.objects.create(reviewer=declined_supervisor, subject_area='Data Science')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Declined review assignment',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Data Science',
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        publication_id = created.data['id']
        self.client.force_authenticate(user=declined_supervisor)
        declined = self.client.post(
            reverse('publication-review-invitation', args=[publication_id]),
            {'decision': 'DECLINED'},
            format='json',
        )
        self.assertEqual(declined.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=owner)
        updated = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'supervisor': replacement_supervisor.id},
            format='json',
        )

        self.assertEqual(updated.status_code, status.HTTP_400_BAD_REQUEST, updated.data)

        original_invitation = PublicationReviewInvitation.objects.get(
            publication_id=publication_id,
            reviewer=declined_supervisor,
        )
        self.assertEqual(original_invitation.status, 'DECLINED')

        self.assertFalse(PublicationReviewInvitation.objects.filter(
            publication_id=publication_id,
            reviewer=replacement_supervisor,
        ).exists())



    def test_owner_cannot_replace_a_reviewer_after_acceptance(self):
        supervisor, _ = self.create_supervisor('accepted-assignment-supervisor')
        replacement_supervisor, _ = self.create_supervisor('accepted-replacement-supervisor')
        owner, _ = self.create_member('accepted-assignment-owner')
        self.assign_predefined_reviewer(owner, supervisor)                       
        ReviewerSubjectArea.objects.create(reviewer=supervisor, subject_area='Data Science')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Accepted review assignment',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Data Science',
                'file_attachment': self.manuscript_upload(),            },
            format='multipart',
        )
        publication_id = created.data['id']

        self.client.force_authenticate(user=supervisor)
        accepted = self.client.post(
            reverse('publication-review-invitation', args=[publication_id]),
            {'decision': 'ACCEPTED'},
            format='json',
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=owner)
        updated = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'supervisor': replacement_supervisor.id},
            format='json',
        )

        self.assertEqual(updated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            PublicationReviewInvitation.objects.get(
                publication_id=publication_id,
                role='SUPERVISOR',
            ).reviewer_id,
            supervisor.id,
        )

    def test_registration_rejects_wrong_role_and_already_claimed_directory_id(self):
        entry = UniversityDirectoryEntry.objects.create(
            university_id='10000123', person_type='LECTURER',
            first_name='Kagiso', last_name='Banda', email='kagiso.banda@ub.ac.bw',
            department='Engineering',
        )
        wrong_role = self.client.post(
            reverse('user_register'),
            {'username': 'wrong-role', 'password': 'test-password', 'role': 'STUDENT', 'university_id': entry.university_id},
            format='json',
        )
        self.assertEqual(wrong_role.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='wrong-role').exists())

        valid = self.client.post(
            reverse('user_register'),
            {'username': 'lecturer-one', 'password': 'test-password', 'role': 'LECTURER', 'university_id': entry.university_id},
            format='json',
        )
        self.assertEqual(valid.status_code, status.HTTP_201_CREATED, valid.data)
        duplicate = self.client.post(
            reverse('user_register'),
            {'username': 'lecturer-two', 'password': 'test-password', 'role': 'LECTURER', 'university_id': entry.university_id},
            format='json',
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='lecturer-two').exists())

    def test_simulated_directory_generation_requires_admin(self):
        user = User.objects.create_user(username='ordinary-directory-user', password='test-password')
        self.client.force_authenticate(user=user)
        denied = self.client.post(reverse('admin_university_directory'), {'count': 5}, format='json')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        admin = User.objects.create_superuser(username='directory-admin', password='test-password')
        self.client.force_authenticate(user=admin)
        generated = self.client.post(reverse('admin_university_directory'), {'count': 5}, format='json')
        self.assertEqual(generated.status_code, status.HTTP_201_CREATED, generated.data)
        self.assertEqual(len(generated.data), 5)
        self.assertTrue(all(item['first_name'] and item['last_name'] and item['email'] and item['department'] for item in generated.data))
        self.assertTrue(all(
            re.fullmatch(r'\d{9}', item['university_id']) if item['person_type'] == 'STUDENT'
            else re.fullmatch(r'[12]\d{7}', item['university_id'])
            for item in generated.data
        ))

    def test_admin_can_edit_retract_restore_and_delete_broadcasts(self):
        admin = User.objects.create_superuser(username='broadcast-admin', password='test-password')
        user = User.objects.create_user(username='broadcast-reader', password='test-password')
        announcement = BroadcastMessage.objects.create(title='Old title', message='Old message', created_by=admin)

        self.client.force_authenticate(user=admin)
        updated = self.client.patch(
            reverse('admin_broadcast_detail', args=[announcement.id]),
            {'title': 'Updated title', 'message': 'Updated message'},
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data['title'], 'Updated title')

        retracted = self.client.patch(
            reverse('admin_broadcast_detail', args=[announcement.id]),
            {'is_active': False},
            format='json',
        )
        self.assertEqual(retracted.status_code, status.HTTP_200_OK)
        self.assertFalse(retracted.data['is_active'])
        self.assertEqual(self.client.get(reverse('broadcast_list')).data, [])
        self.assertEqual(len(self.client.get(reverse('admin_broadcast_list')).data), 1)

        restored = self.client.patch(
            reverse('admin_broadcast_detail', args=[announcement.id]),
            {'is_active': True},
            format='json',
        )
        self.assertTrue(restored.data['is_active'])
        self.assertEqual(len(self.client.get(reverse('broadcast_list')).data), 1)

        denied = self.client.delete(reverse('admin_broadcast_detail', args=[announcement.id]))
        self.assertEqual(denied.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(BroadcastMessage.objects.filter(pk=announcement.id).exists())

        self.client.force_authenticate(user=user)
        forbidden = self.client.patch(reverse('admin_broadcast_detail', args=[announcement.id]), {'title': 'No access'}, format='json')
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_registration_rejects_ids_with_invalid_format(self):
        response = self.client.post(
            reverse('user_register'),
            {'username': 'bad-id-user', 'password': 'test-password', 'role': 'STUDENT', 'university_id': 'UBS000001'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Student IDs must contain a four-digit year followed by five digits.', response.data['university_id'][0])

    def test_public_registration_cannot_grant_privileged_role(self):
        response = self.client.post(
            reverse('user_register'),
            {'username': 'self-reviewer', 'password': 'test-password', 'role': 'REVIEWER', 'department': 'Computer Science'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='self-reviewer').exists())

    def test_admin_user_management_requires_staff(self):
        user = User.objects.create_user(username='ordinary-user', password='test-password')
        self.client.force_authenticate(user=user)

        response = self.client.get(reverse('admin_user_list'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(ADMIN_PORTAL_USERNAME='portal-admin', ADMIN_PORTAL_PASSWORD='fixed-test-password')
    def test_fixed_admin_login_issues_staff_token(self):
        response = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'portal-admin', 'password': 'fixed-test-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        admin = User.objects.get(username='portal-admin')
        self.assertTrue(admin.is_staff)
        self.assertEqual(UserProfile.objects.get(user=admin).role, 'ADMIN')
        self.assertEqual(AccessToken(response.data['access'])['role'], 'ADMIN')

    @override_settings(ADMIN_PORTAL_USERNAME='portal-admin', ADMIN_PORTAL_PASSWORD='fixed-test-password')
    def test_admin_credentials_are_rejected_by_unified_login_when_invalid(self):
        response = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'portal-admin', 'password': 'wrong-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_current_profile_returns_personal_data_and_owned_publication_stats(self):
        user = User.objects.create_user(username='profile-user', password='test-password', first_name='Ari', last_name='Researcher', email='ari@example.com')
        profile = UserProfile.objects.create(user=user, role='LECTURER', department='Computer Science')
        self.client.force_authenticate(user=user)
        publication = Publication.objects.create(
            title='My publication',
            owner=user,
            abstract='Abstract',
            pub_type='JOURNAL',
            subject_area='Computer Science',
            download_count=4,
            is_approved=True,
        )
        PublicationDeletionRequest.objects.create(publication=publication, requested_by=user)

        response = self.client.get(reverse('current_user_profile'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['first_name'], 'Ari')
        self.assertEqual(response.data['role'], profile.role)
        self.assertEqual(response.data['uploaded_materials'], 1)
        self.assertEqual(response.data['approved_materials'], 1)
        self.assertEqual(response.data['total_downloads'], 4)
        self.assertEqual(response.data['pending_deletion_requests'], 1)

    def test_only_owner_can_edit_publication(self):
        reviewer, supervisor = self.create_supervisor()
        owner, _ = self.create_member('owner', supervisor)
        self.assign_predefined_reviewer(owner, reviewer)
        other_user, _ = self.create_member('other', supervisor)
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Owned paper', 'abstract': self.valid_abstract, 'pub_type': 'JOURNAL', 'subject_area': 'Computer Science', 'supervisor': supervisor.user_id, 'file_attachment': 			self.manuscript_upload()},
            format='multipart',
        )
        publication_id = create_response.data['id']
        owner_update = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'title': 'Updated by owner'},
            format='json',
        )
        self.assertEqual(owner_update.status_code, status.HTTP_200_OK, owner_update.data)
        self.assertEqual(owner_update.data['title'], 'Updated by owner')
        self.assertTrue(PublicationReviewInvitation.objects.filter(
            publication_id=publication_id,
            reviewer=reviewer,
        ).exists())

        self.client.force_authenticate(user=other_user)
        response = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'title': 'Changed by someone else'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_cannot_edit_approved_publication(self):
        owner, _ = self.create_member('approved-owner', None)
        publication = Publication.objects.create(
            title='Approved paper', owner=owner, abstract='Original abstract',
            pub_type='JOURNAL', subject_area='Computer Science', is_approved=True,
        )
        self.client.force_authenticate(user=owner)

        response = self.client.patch(
            reverse('publication-detail', args=[publication.id]),
            {'title': 'Changed approved paper'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        publication.refresh_from_db()
        self.assertEqual(publication.title, 'Approved paper')

    def test_publication_edits_store_owner_only_change_history(self):
        owner, _ = self.create_member('history-owner')
        reviewer, _ = self.create_supervisor('history-reviewer')
        author = AuthorProfile.objects.create(
            first_name='Ada',
            last_name='Lovelace',
            institution='Analytical Society',
        )
        publication = self.create_review_publication(
            owner,
            reviewer,
            title='Original version title',
            abstract=self.valid_abstract,
        )
        publication.authors.add(author)
        self.client.force_authenticate(user=owner)

        first_update = self.client.patch(
            reverse('publication-detail', args=[publication.id]),
            {'title': 'Second version title'},
            format='json',
        )
        self.assertEqual(first_update.status_code, status.HTTP_200_OK, first_update.data)
        second_update = self.client.patch(
            reverse('publication-detail', args=[publication.id]),
            {'title': 'Current version title'},
            format='json',
        )
        self.assertEqual(second_update.status_code, status.HTTP_200_OK, second_update.data)

        history = self.client.get(reverse('publication-history', args=[publication.id]))
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual([version['version_number'] for version in history.data], [2, 1])
        self.assertEqual(history.data[0]['snapshot']['title'], 'Second version title')
        self.assertEqual(history.data[1]['snapshot']['title'], 'Original version title')
        self.assertEqual(history.data[1]['snapshot']['authors'][0]['name'], 'Ada Lovelace')
        self.assertEqual(history.data[1]['snapshot']['reviewers'][0]['name'], 'history-reviewer')
        self.assertEqual(PublicationVersion.objects.filter(publication=publication).count(), 2)

        publication.is_approved = True
        publication.save()
        other_user, _ = self.create_member('history-other-user')
        self.client.force_authenticate(user=other_user)
        denied = self.client.get(reverse('publication-history', args=[publication.id]))
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=None)
        guest_denied = self.client.get(reverse('publication-history', args=[publication.id]))
        self.assertEqual(guest_denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_guest_can_view_approved_publication_inline_without_incrementing_downloads(self):
        owner = User.objects.create_user(username='public-view-owner', password='test-password')
        publication = Publication.objects.create(
            title='Public view paper', owner=owner, abstract='Abstract',
            pub_type='JOURNAL', subject_area='Computer Science', is_approved=True,
            file_attachment=SimpleUploadedFile('public-view.pdf', b'%PDF-1.4 view', content_type='application/pdf'),
        )

        response = self.client.get(reverse('publication-view', args=[publication.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('inline', response['Content-Disposition'])
        self.assertEqual(b''.join(response.streaming_content), b'%PDF-1.4 view')
        publication.refresh_from_db()
        self.assertEqual(publication.download_count, 0)

    def test_pending_publications_are_visible_only_to_owner_and_reviewer(self):
        reviewer, reviewer_profile = self.create_supervisor('publication-supervisor')
        owner, _ = self.create_member('pending-owner', reviewer_profile)
        reader, _ = self.create_member('public-reader', reviewer_profile)
        approved = Publication.objects.create(
            title='Verified paper', owner=owner, abstract='Public abstract',
            pub_type='JOURNAL', subject_area='Computer Science', is_approved=True,
        )
        pending = self.create_review_publication(
            owner, reviewer, title='Pending paper', abstract='Private abstract',
        )

        self.client.force_authenticate(user=reader)
        public_results = self.client.get(reverse('publication-list'), {'search': 'paper'})
        self.assertEqual([item['id'] for item in public_results.data], [approved.id])
        self.assertEqual(self.client.get(reverse('publication-detail', args=[pending.id])).status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=owner)
        owner_results = self.client.get(reverse('publication-list'), {'search': 'paper'})
        self.assertEqual({item['id'] for item in owner_results.data}, {approved.id, pending.id})
        self.client.patch(reverse('publication-detail', args=[pending.id]), {'is_approved': True}, format='json')
        pending.refresh_from_db()
        self.assertFalse(pending.is_approved)

        self.client.force_authenticate(user=reviewer)
        reviewer_results = self.client.get(reverse('publication-list'), {'search': 'paper'})
        self.assertEqual({item['id'] for item in reviewer_results.data}, {approved.id, pending.id})

    def test_publication_search_supports_field_type_author_and_subject_filters(self):
        owner, _ = self.create_member('search-owner')
        author = AuthorProfile.objects.create(first_name='Ada', last_name='Hopper')
        matching = Publication.objects.create(
            title='Distributed systems',
            owner=owner,
            abstract='Research on reliable processing.',
            pub_type='CONFERENCE',
            subject_area='Computer Science',
            is_approved=True,
        )
        matching.authors.add(author)
        other = Publication.objects.create(
            title='Ada Lovelace biography',
            owner=owner,
            abstract='A history paper.',
            pub_type='JOURNAL',
            subject_area='History',
            is_approved=True,
        )
        other.authors.add(AuthorProfile.objects.create(first_name='Grace', last_name='Hopper'))
        self.client.force_authenticate(user=owner)

        author_search = self.client.get(
            reverse('publication-list'),
            {'search': 'Ada', 'search_in': 'author'},
        )
        self.assertEqual([record['id'] for record in author_search.data], [matching.id])

        default_field_search = self.client.get(
            reverse('publication-list'),
            {'search': 'reliable'},
        )
        self.assertEqual([record['id'] for record in default_field_search.data], [matching.id])

        title_search = self.client.get(
            reverse('publication-list'),
            {'search': 'Ada', 'search_in': 'title'},
        )
        self.assertEqual([record['id'] for record in title_search.data], [other.id])

        no_fields_selected = self.client.get(
            reverse('publication-list'),
            [('search', 'Ada'), ('search_in', 'none')],
        )
        self.assertEqual(no_fields_selected.data, [])

        type_filter = self.client.get(
            reverse('publication-list'),
            {'pub_type': 'CONFERENCE'},
        )
        self.assertEqual([record['id'] for record in type_filter.data], [matching.id])

        author_filter = self.client.get(
            reverse('publication-list'),
            {'author': 'Grace'},
        )
        self.assertEqual([record['id'] for record in author_filter.data], [other.id])

        subject_filter = self.client.get(
            reverse('publication-list'),
            {'subject_area': 'History'},
        )
        self.assertEqual([record['id'] for record in subject_filter.data], [other.id])

        filtered = self.client.get(
            reverse('publication-list'),
            [('pub_type', 'CONFERENCE'), ('pub_type', 'JOURNAL'), ('author', 'Hopper'), ('subject_area', 'Computer')],
        )
        self.assertEqual({record['id'] for record in filtered.data}, {matching.id})

    def test_publication_search_filters_date_range_and_month(self):
        owner, _ = self.create_member('date-filter-owner')
        publications = []
        for title, submitted_at in [
            ('Before range', datetime(2024, 1, 31)),
            ('Range start', datetime(2024, 2, 1)),
            ('Range end', datetime(2024, 3, 31)),
            ('After range', datetime(2024, 4, 1)),
        ]:
            publication = Publication.objects.create(
                title=title,
                owner=owner,
                abstract='A publication for date filter tests.',
                pub_type='JOURNAL',
                subject_area='Computer Science',
                is_approved=True,
            )
            Publication.objects.filter(pk=publication.pk).update(
                upload_date=timezone.make_aware(submitted_at),
            )
            publications.append(publication)
        self.client.force_authenticate(user=owner)

        date_range = self.client.get(
            reverse('publication-list'),
            {'date_from': '2024-02-01', 'date_to': '2024-03-31'},
        )
        self.assertEqual(
            {record['id'] for record in date_range.data},
            {publications[1].id, publications[2].id},
        )

        february = self.client.get(reverse('publication-list'), {'month': '2'})
        self.assertEqual([record['id'] for record in february.data], [publications[1].id])

        march_in_range = self.client.get(
            reverse('publication-list'),
            {'date_from': '2024-01-01', 'date_to': '2024-12-31', 'month': '3'},
        )
        self.assertEqual([record['id'] for record in march_in_range.data], [publications[2].id])

    def test_authenticated_repository_defaults_to_personal_items_and_searches_repository(self):
        member, _ = self.create_member('personal-repository-user')
        other_owner, _ = self.create_member('other-repository-owner')
        personal = Publication.objects.create(
            title='My private draft',
            owner=member,
            abstract='Personal draft abstract',
            pub_type='JOURNAL',
            subject_area='Computer Science',
        )
        lecturer, _ = self.create_supervisor('review-assignment-lecturer')
        assigned_for_review = self.create_review_publication(
            other_owner,
            lecturer,
            title='Assigned review request',
        )
        public = Publication.objects.create(
            title='Shared catalog paper',
            owner=other_owner,
            abstract='An approved repository record',
            pub_type='JOURNAL',
            subject_area='Computer Science',
            is_approved=True,
        )
        self.client.force_authenticate(user=member)

        personal_results = self.client.get(reverse('publication-list'))
        self.assertEqual([item['id'] for item in personal_results.data], [personal.id])

        highlights = self.client.get(reverse('publication-list'), {'highlights': 'true'})
        self.assertEqual([item['id'] for item in highlights.data], [public.id])

        searched = self.client.get(reverse('publication-list'), {'search': 'catalog'})
        self.assertEqual([item['id'] for item in searched.data], [public.id])

        self.client.force_authenticate(user=lecturer)
        review_assignments = self.client.get(
            reverse('publication-list'),
            {'review_assignments': 'true'},
        )
        self.assertEqual([item['id'] for item in review_assignments.data], [assigned_for_review.id])

    def test_assigned_reviewer_can_accept_and_approve_publication(self):
        reviewer, _ = self.create_supervisor('approval-reviewer')
        owner, _ = self.create_member('approval-owner')
        self.assign_predefined_reviewer(owner, reviewer)
        reader, _ = self.create_member('approval-reader', role='LECTURER')

        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Approval paper',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'file_attachment': self.manuscript_upload(),            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication_id = response.data['id']

        self.assertEqual(response.data['supervisor_id'], reviewer.id)
        self.assertIsNone(response.data['co_supervisor_id'])

        invitation_notice = UserNotification.objects.get(user=reviewer)
        self.assertEqual(
            invitation_notice.link,
            f'/lecturer/reviews?publication={publication_id}',
        )

        self.client.force_authenticate(user=reader)

        denied = self.client.post(
            reverse('publication-review-invitation', args=[publication_id]),
            {'decision': 'ACCEPTED'},
            format='json',
        )

        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=reviewer)

        accepted = self.client.post(
            reverse('publication-review-invitation', args=[publication_id]),
            {'decision': 'ACCEPTED'},
            format='json',
        )

        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        self.assertEqual(accepted.data['review_status'], 'PENDING')

        approved = self.client.post(
            reverse('publication-review-decision', args=[publication_id]),
            {'decision': 'APPROVED'},
            format='json',
        )

        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        self.assertTrue(approved.data['is_approved'])
        self.assertEqual(approved.data['review_status'], 'APPROVED')

    def test_reviewers_can_request_revisions_then_owner_resubmits(self):
        reviewer, _ = self.create_supervisor('revision-supervisor')
        owner, _ = self.create_member('revision-owner')
        self.assign_predefined_reviewer(owner, reviewer)
        self.client.force_authenticate(user=owner)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Revision test paper',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        publication_id = response.data['id']
        self.client.force_authenticate(user=reviewer)
        self.client.post(reverse('publication-review-invitation', args=[publication_id]), {'decision': 'ACCEPTED'}, format='json')
        missing_reason = self.client.post(
            reverse('publication-review-decision', args=[publication_id]),
            {'decision': 'REVISION_REQUESTED', 'feedback': '  '}, format='json',
        )
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        revision_request = self.client.post(
            reverse('publication-review-decision', args=[publication_id]),
            {'decision': 'REVISION_REQUESTED', 'feedback': 'Please add a clearer methodology section.'},
            format='json',
        )
        self.assertEqual(revision_request.status_code, status.HTTP_200_OK, revision_request.data)
        self.assertEqual(revision_request.data['review_status'], 'REVISION_REQUESTED')
        revision_notice = UserNotification.objects.get(user=owner, title__startswith='Revisions requested')
        self.assertEqual(revision_notice.link, f'/?publication={publication_id}')

        self.client.force_authenticate(user=owner)
        updated = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'abstract': ' '.join(['Revised academic abstract word'] * 40)},
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        publication = Publication.objects.get(pk=publication_id)
        self.assertEqual(publication.review_status, 'PENDING')
        self.assertEqual(publication.review_feedback, '')
        invitation = publication.review_invitations.get(reviewer=reviewer)
        self.assertEqual(invitation.decision, 'PENDING')

    def test_owner_cannot_manually_change_predefined_reviewers(self):
        supervisor, _ = self.create_supervisor('primary-supervisor')
        co_supervisor, _ = self.create_supervisor('optional-co-supervisor')
        owner, _ = self.create_member('co-supervisor-owner')
        self.assign_predefined_reviewer(owner, supervisor)
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Optional co-supervisor test',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': supervisor.id,
                'co_supervisor': co_supervisor.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        updated = self.client.put(
            reverse('publication-detail', args=[created.data['id']]),
            {
                'title': 'Optional co-supervisor test',
                'abstract': ' '.join(['Updated academic abstract word'] * 40),
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': str(supervisor.id),
                'co_supervisor': '',
            },
            format='multipart',
        )

        self.assertEqual(updated.status_code, status.HTTP_400_BAD_REQUEST, updated.data)
        self.assertFalse(PublicationReviewInvitation.objects.filter(
            publication_id=created.data['id'],
            role='CO_SUPERVISOR',
        ).exists())

    def test_only_owner_or_reviewer_can_download_pending_publication(self):
        reviewer, reviewer_profile = self.create_supervisor('download-supervisor')
        owner, _ = self.create_member('download-owner', reviewer_profile)
        reader, _ = self.create_member('download-reader', reviewer_profile)
        publication = self.create_review_publication(
            owner, reviewer, title='Download pending paper', abstract='Abstract',
            file_attachment=SimpleUploadedFile('pending.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
        )

        self.client.force_authenticate(user=reader)
        self.assertEqual(self.client.get(reverse('publication-download', args=[publication.id])).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(user=owner)
        download = self.client.get(reverse('publication-download', args=[publication.id]))
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertIn('attachment', download['Content-Disposition'])
        self.assertEqual(b''.join(download.streaming_content), b'%PDF-1.4 test')

    def test_only_owner_can_request_publication_deletion(self):
        reviewer, supervisor = self.create_supervisor('deletion-supervisor')
        owner, _ = self.create_member('deletion-owner', supervisor)
        self.assign_predefined_reviewer(owner, reviewer)
        other_user, _ = self.create_member('deletion-other', supervisor)
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Delete request paper', 'abstract': self.valid_abstract, 'pub_type': 'JOURNAL', 'subject_area': 'Computer Science', 'supervisor': supervisor.user_id, 'file_attachment': 		self.manuscript_upload()},
            format='multipart',
        )
        publication_id = create_response.data['id']

        self.client.force_authenticate(user=other_user)
        denied = self.client.post(reverse('publication-request-deletion', args=[publication_id]))
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=owner)
        accepted = self.client.post(
            reverse('publication-request-deletion', args=[publication_id]),
            {'reason': 'Duplicate record'},
            format='json',
        )

        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED, accepted.data)
        self.assertEqual(PublicationDeletionRequest.objects.get().requested_by, owner)

    def test_author_can_be_created_with_details_and_searched(self):
        user = User.objects.create_user(username='author-manager', password='test-password')
        self.client.force_authenticate(user=user)
        create_response = self.client.post(
            reverse('authorprofile-list'),
            {
                'first_name': 'Ada',
                'last_name': 'Researcher',
                'physical_address': 'Gaborone',
                'occupation': 'Lecturer',
                'department': 'Computer Science',
                'institution': 'UB',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

        search_response = self.client.get(reverse('authorprofile-list'), {'search': 'Gaborone'})

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data[0]['name'], 'Ada Researcher')

    def test_publication_can_be_created_with_selected_authors(self):
        reviewer, supervisor = self.create_supervisor('author-publication-supervisor')
        user, _ = self.create_member('multi-author-owner', supervisor)
        self.assign_predefined_reviewer(user, reviewer)
        self.client.force_authenticate(user=user)
        author = AuthorProfile.objects.create(first_name='Grace', last_name='Hopper')

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Collaborative paper',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'authors': [author.id],
                'supervisor': supervisor.user_id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication = Publication.objects.get(title='Collaborative paper')
        self.assertEqual(list(publication.authors.all()), [author])

    def test_login_access_token_authorizes_publication_upload(self):
        reviewer, supervisor = self.create_supervisor('token-supervisor')
        user, _ = self.create_member('token-student', supervisor)
        self.assign_predefined_reviewer(user, reviewer)
        token_response = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'token-student', 'password': 'test-password'},
            format='json',
        )
        self.assertEqual(token_response.status_code, status.HTTP_200_OK, token_response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'JWT upload test',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': SimpleUploadedFile('jwt-paper.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_authenticated_user_can_upload_publication_without_authors_field(self):
        reviewer, supervisor = self.create_supervisor('upload-supervisor')
        user, _ = self.create_member('student', supervisor)
        self.assign_predefined_reviewer(user, reviewer)
        self.client.force_authenticate(user=user)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Upload test',
                'abstract': self.valid_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': SimpleUploadedFile('paper.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication = Publication.objects.get(title='Upload test')
        self.assertTrue(publication.file_attachment)
        self.assertEqual(publication.authors.count(), 1)

    def test_create_publication(self):
        reviewer, supervisor = self.create_supervisor('publication-supervisor')
        user, _ = self.create_member('publication-author', supervisor)
        self.assign_predefined_reviewer(user, reviewer)
        self.client.force_authenticate(user=user)
        url = reverse('publication-list') # matches router endpoint
        data = {
            'title': 'An Analysis of Computing Systems at UB',
            'abstract': self.valid_abstract,
            'pub_type': 'JOURNAL',
            'subject_area': 'Computer Science',
            'supervisor': reviewer.id,
            'authors': [],
            'file_attachment': self.manuscript_upload(),
        }
        response = self.client.post(url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Publication.objects.count(), 1)

    def test_publication_abstract_too_short_is_rejected(self):
        reviewer, _ = self.create_supervisor('short-abstract-reviewer')
        user, _ = self.create_member('short-abstract-author')
        self.client.force_authenticate(user=user)
        short_abstract = ' '.join(['word'] * 149)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Short Abstract Paper',
                'abstract': short_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('abstract', response.data)
        self.assertIn('between 150 and 250 words', str(response.data['abstract'][0]))

    def test_publication_abstract_too_long_is_rejected(self):
        reviewer, _ = self.create_supervisor('long-abstract-reviewer')
        user, _ = self.create_member('long-abstract-author')
        self.client.force_authenticate(user=user)
        long_abstract = ' '.join(['word'] * 251)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Long Abstract Paper',
                'abstract': long_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('abstract', response.data)
        self.assertIn('between 150 and 250 words', str(response.data['abstract'][0]))

    def test_publication_abstract_lower_boundary_150_words_is_accepted(self):
        reviewer, _ = self.create_supervisor('boundary-min-reviewer')
        user, _ = self.create_member('boundary-min-author')
        self.assign_predefined_reviewer(user, reviewer)        
        self.client.force_authenticate(user=user)
        boundary_min_abstract = ' '.join(['word'] * 150)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Boundary Min Abstract Paper',
                'abstract': boundary_min_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Publication.objects.filter(title='Boundary Min Abstract Paper').count(), 1)

    def test_publication_abstract_upper_boundary_250_words_is_accepted(self):
        reviewer, _ = self.create_supervisor('boundary-max-reviewer')
        user, _ = self.create_member('boundary-max-author')
        self.assign_predefined_reviewer(user, reviewer)
        self.client.force_authenticate(user=user)
        boundary_max_abstract = ' '.join(['word'] * 250)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Boundary Max Abstract Paper',
                'abstract': boundary_max_abstract,
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'supervisor': reviewer.id,
                'file_attachment': self.manuscript_upload(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Publication.objects.filter(title='Boundary Max Abstract Paper').count(), 1)

    def test_publication_model_clean_enforces_abstract_word_count(self):
        publication_short = Publication(
            title='Model Short Test',
            abstract='only three words',
            pub_type='JOURNAL',
            subject_area='Computer Science',
        )
        with self.assertRaises(ValidationError) as context:
            publication_short.clean()
        self.assertIn('between 150 and 250 words', str(context.exception))

        publication_valid = Publication(
            title='Model Valid Test',
            abstract=' '.join(['word'] * 150),
            pub_type='JOURNAL',
            subject_area='Computer Science',
        )
        # Should not raise
        publication_valid.clean()
