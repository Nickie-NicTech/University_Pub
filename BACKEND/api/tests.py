from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from django.test import override_settings
import re
<<<<<<< HEAD
from .models import AuthorProfile, Publication, PublicationDeletionRequest, UserProfile, UniversityDirectoryEntry, BroadcastMessage
=======
from .models import AuthorProfile, Publication, PublicationDeletionRequest, UserProfile, UniversityDirectoryEntry
>>>>>>> 532f38b (add new files and initial commit)
from .serializers import RepositoryTokenObtainPairSerializer

class TokenClaimsTests(TestCase):
    def test_token_includes_username_and_profile_role(self):
        user = User.objects.create_user(username='lecturer', password='test-password')
        UserProfile.objects.create(user=user, role='LECTURER', department='Computing')

        token = RepositoryTokenObtainPairSerializer.get_token(user)

        self.assertEqual(token['username'], 'lecturer')
        self.assertEqual(token['role'], 'LECTURER')

    def test_token_without_profile_uses_member_role(self):
        user = User.objects.create_user(username='legacy-user', password='test-password')

        token = RepositoryTokenObtainPairSerializer.get_token(user)

        self.assertEqual(token['username'], 'legacy-user')
        self.assertEqual(token['role'], 'STUDENT')
        self.assertTrue(UserProfile.objects.filter(user=user).exists())

class PublicationTests(APITestCase):
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

<<<<<<< HEAD
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

=======
>>>>>>> 532f38b (add new files and initial commit)
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
            {'username': 'self-reviewer', 'password': 'test-password', 'role': 'APPROVER', 'department': 'Computing'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='self-reviewer').exists())

    def test_user_can_request_reviewer_access_and_admin_can_approve(self):
        applicant = User.objects.create_user(username='applicant', password='test-password')
        UserProfile.objects.create(user=applicant, role='LECTURER', department='Computing')
        self.client.force_authenticate(user=applicant)
        application = self.client.post(
            reverse('reviewer_application'),
            {'expertise': 'Computer Science', 'reason': 'I have relevant teaching and research experience.'},
            format='json',
        )
        self.assertEqual(application.status_code, status.HTTP_201_CREATED, application.data)

        duplicate = self.client.post(
            reverse('reviewer_application'),
            {'expertise': 'Computer Science', 'reason': 'Second request.'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)

        admin = User.objects.create_superuser(username='portal-admin', password='test-password')
        self.client.force_authenticate(user=admin)
        approved = self.client.patch(
            reverse('admin_reviewer_application_detail', args=[application.data['id']]),
            {'status': 'APPROVED'},
            format='json',
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        self.assertEqual(UserProfile.objects.get(user=applicant).role, 'REVIEWER')

    def test_admin_user_management_requires_staff(self):
        user = User.objects.create_user(username='ordinary-user', password='test-password')
        self.client.force_authenticate(user=user)

        response = self.client.get(reverse('admin_user_list'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(ADMIN_PORTAL_USERNAME='portal-admin', ADMIN_PORTAL_PASSWORD='fixed-test-password')
    def test_fixed_admin_login_issues_staff_token(self):
        response = self.client.post(
            reverse('admin_portal_login'),
            {'username': 'portal-admin', 'password': 'fixed-test-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        admin = User.objects.get(username='portal-admin')
        self.assertTrue(admin.is_staff)
        self.assertEqual(UserProfile.objects.get(user=admin).role, 'ADMIN')

    def test_current_profile_returns_personal_data_and_owned_publication_stats(self):
        user = User.objects.create_user(username='profile-user', password='test-password', first_name='Ari', last_name='Researcher', email='ari@example.com')
        profile = UserProfile.objects.create(user=user, role='LECTURER', department='Computing')
        self.client.force_authenticate(user=user)
        publication = Publication.objects.create(
            title='My publication',
            owner=user,
            abstract='Abstract',
            pub_type='JOURNAL',
            subject_area='Computing',
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
        owner = User.objects.create_user(username='owner', password='test-password')
        other_user = User.objects.create_user(username='other', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=other_user, role='STUDENT', department='Computing')
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Owned paper', 'abstract': 'Abstract', 'pub_type': 'JOURNAL', 'subject_area': 'Computing'},
            format='json',
        )
        publication_id = create_response.data['id']

        self.client.force_authenticate(user=other_user)
        response = self.client.patch(
            reverse('publication-detail', args=[publication_id]),
            {'title': 'Changed by someone else'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_publications_are_visible_only_to_owner_and_reviewer(self):
        owner = User.objects.create_user(username='pending-owner', password='test-password')
        reader = User.objects.create_user(username='public-reader', password='test-password')
        reviewer = User.objects.create_user(username='publication-reviewer', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=reader, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=reviewer, role='REVIEWER', department='Computing')
        approved = Publication.objects.create(
            title='Verified paper', owner=owner, abstract='Public abstract',
            pub_type='JOURNAL', subject_area='Computing', is_approved=True,
        )
        pending = Publication.objects.create(
            title='Pending paper', owner=owner, abstract='Private abstract',
            pub_type='JOURNAL', subject_area='Computing',
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

    def test_only_non_owner_reviewer_can_approve_pending_publication(self):
        owner = User.objects.create_user(username='approval-owner', password='test-password')
        reader = User.objects.create_user(username='approval-reader', password='test-password')
        reviewer = User.objects.create_user(username='approval-reviewer', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=reader, role='LECTURER', department='Computing')
        UserProfile.objects.create(user=reviewer, role='REVIEWER', department='Computing')
        publication = Publication.objects.create(
            title='Approval paper', owner=owner, abstract='Abstract',
            pub_type='JOURNAL', subject_area='Computing',
        )

        self.client.force_authenticate(user=owner)
        self.assertEqual(self.client.post(reverse('publication-approve', args=[publication.id])).status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(user=reader)
        self.assertEqual(self.client.post(reverse('publication-approve', args=[publication.id])).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(user=reviewer)
        approved = self.client.post(reverse('publication-approve', args=[publication.id]))
        self.assertEqual(approved.status_code, status.HTTP_200_OK, approved.data)
        publication.refresh_from_db()
        self.assertTrue(publication.is_approved)

    def test_reviewer_rejection_requires_reason_and_owner_can_resubmit(self):
        owner = User.objects.create_user(username='rejection-owner', password='test-password')
        reviewer = User.objects.create_user(username='rejection-reviewer', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=reviewer, role='REVIEWER', department='Computing')
        publication = Publication.objects.create(
            title='Rejection test paper', owner=owner, abstract='Initial abstract',
            pub_type='JOURNAL', subject_area='Computing',
        )

        self.client.force_authenticate(user=reviewer)
        missing_reason = self.client.post(reverse('publication-reject', args=[publication.id]), {'reason': '  '}, format='json')
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        rejected = self.client.post(
            reverse('publication-reject', args=[publication.id]),
            {'reason': 'Please add a clearer methodology section.'},
            format='json',
        )
        self.assertEqual(rejected.status_code, status.HTTP_200_OK, rejected.data)
        self.assertEqual(rejected.data['review_status'], 'REJECTED')
        self.assertEqual(rejected.data['rejection_reason'], 'Please add a clearer methodology section.')

        self.client.force_authenticate(user=owner)
        owner_record = self.client.get(reverse('publication-detail', args=[publication.id]))
        self.assertEqual(owner_record.data['rejection_reason'], 'Please add a clearer methodology section.')
        self.client.patch(
            reverse('publication-detail', args=[publication.id]),
            {'abstract': 'Revised abstract'},
            format='json',
        )
        publication.refresh_from_db()
        self.assertEqual(publication.review_status, 'PENDING')
        self.assertEqual(publication.rejection_reason, '')

    def test_only_owner_or_reviewer_can_download_pending_publication(self):
        owner = User.objects.create_user(username='download-owner', password='test-password')
        reader = User.objects.create_user(username='download-reader', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=reader, role='STUDENT', department='Computing')
        publication = Publication.objects.create(
            title='Download pending paper', owner=owner, abstract='Abstract',
            pub_type='JOURNAL', subject_area='Computing',
            file_attachment=SimpleUploadedFile('pending.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
        )

        self.client.force_authenticate(user=reader)
        self.assertEqual(self.client.get(reverse('publication-download', args=[publication.id])).status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(user=owner)
        self.assertEqual(self.client.get(reverse('publication-download', args=[publication.id])).status_code, status.HTTP_302_FOUND)

    def test_only_owner_can_request_publication_deletion(self):
        owner = User.objects.create_user(username='deletion-owner', password='test-password')
        other_user = User.objects.create_user(username='deletion-other', password='test-password')
        UserProfile.objects.create(user=owner, role='STUDENT', department='Computing')
        UserProfile.objects.create(user=other_user, role='STUDENT', department='Computing')
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Delete request paper', 'abstract': 'Abstract', 'pub_type': 'JOURNAL', 'subject_area': 'Computing'},
            format='json',
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
                'department': 'Computing',
                'institution': 'UB',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)

        search_response = self.client.get(reverse('authorprofile-list'), {'search': 'Gaborone'})

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data[0]['name'], 'Ada Researcher')

    def test_publication_can_be_created_with_selected_authors(self):
        user = User.objects.create_user(username='multi-author-owner', password='test-password')
        self.client.force_authenticate(user=user)
        author = AuthorProfile.objects.create(first_name='Grace', last_name='Hopper')

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Collaborative paper',
                'abstract': 'A paper with a selected author.',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computing',
                'authors': [author.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication = Publication.objects.get(title='Collaborative paper')
        self.assertEqual(list(publication.authors.all()), [author])

    def test_login_access_token_authorizes_publication_upload(self):
        user = User.objects.create_user(username='token-student', password='test-password')
        UserProfile.objects.create(user=user, role='STUDENT', department='Computing')
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
                'abstract': 'Testing token authentication for uploads.',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'file_attachment': SimpleUploadedFile('jwt-paper.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_authenticated_user_can_upload_publication_without_authors_field(self):
        user = User.objects.create_user(username='student', password='test-password')
        UserProfile.objects.create(user=user, role='STUDENT', department='Computing')
        self.client.force_authenticate(user=user)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Upload test',
                'abstract': 'Testing the upload endpoint.',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computer Science',
                'file_attachment': SimpleUploadedFile('paper.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication = Publication.objects.get(title='Upload test')
        self.assertTrue(publication.file_attachment)
        self.assertEqual(publication.authors.count(), 1)

    def test_create_publication(self):
        user = User.objects.create_user(username='publication-author', password='test-password')
        UserProfile.objects.create(user=user, role='STUDENT', department='Computing')
        self.client.force_authenticate(user=user)
        url = reverse('publication-list') # matches router endpoint
        data = {
            'title': 'An Analysis of Computing Systems at UB',
            'abstract': 'This paper explores local server infrastructure...',
            'pub_type': 'JOURNAL',
            'subject_area': 'Computer Science',
            'authors': []
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Publication.objects.count(), 1)
