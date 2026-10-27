from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework_simplejwt.tokens import AccessToken
import re
from .models import AuthorProfile, Publication, PublicationDeletionRequest, PublicationReviewInvitation, ReviewerSubjectArea, UserNotification, UserProfile, UniversityDirectoryEntry, BroadcastMessage
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


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='unipub@example.com',
)
class PublicationTests(APITestCase):
    def create_supervisor(self, username='supervisor'):
        user = User.objects.create_user(
            username=username,
            password='test-password',
            email=f'{username}@example.com',
        )
        profile = UserProfile.objects.create(user=user, role='LECTURER', department='Computing')
        ReviewerSubjectArea.objects.get_or_create(reviewer=user, subject_area='Computing')
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
            department='Computing',
        )
        return user, profile

    def create_review_publication(self, owner, reviewer, **fields):
        publication = Publication.objects.create(
            owner=owner,
            title=fields.pop('title', 'Review test paper'),
            abstract=fields.pop('abstract', 'Abstract'),
            pub_type=fields.pop('pub_type', 'JOURNAL'),
            subject_area=fields.pop('subject_area', 'Computing'),
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
            subject_area='Neuroscience',
        )

        response = self.client.get(
            reverse('supervisor_list'),
            {'subject_area': 'neuroscience'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['user_id'], matching_lecturer.id)
        self.assertTrue(response.data[0]['is_subject_match'])
        other = next(item for item in response.data if item['user_id'] == other_lecturer.id)
        self.assertFalse(other['is_subject_match'])

    def test_publication_creation_automatically_assigns_one_subject_mapped_reviewer(self):
        reviewer, _ = self.create_supervisor('auto-reviewer')
        other_reviewer, _ = self.create_supervisor('other-auto-reviewer')
        owner, _ = self.create_member('auto-reviewer-owner')

        ReviewerSubjectArea.objects.create(
            reviewer=reviewer,
            subject_area='Neuroscience',
        )
        ReviewerSubjectArea.objects.create(
            reviewer=other_reviewer,
            subject_area='Neuroscience',
        )

        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Automatically assigned paper',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'neuroscience',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['supervisor_id'], reviewer.id)
        self.assertIsNone(response.data['co_supervisor_id'])
        self.assertEqual(response.data['supervisor_name'], reviewer.get_full_name() or reviewer.username)

    def test_publication_creation_requires_a_subject_mapped_supervisor(self):
        owner, _ = self.create_member('unmapped-subject-owner')
        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Unmapped paper',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Unmapped subject',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('subject_area', response.data)

    def test_owner_can_reassign_unanswered_mapped_supervisor_while_editing(self):
        mapped_supervisor, _ = self.create_supervisor('unanswered-mapped-supervisor')
        replacement_supervisor, _ = self.create_supervisor('unanswered-replacement-supervisor')
        owner, _ = self.create_member('unanswered-assignment-owner')
        ReviewerSubjectArea.objects.create(reviewer=mapped_supervisor, subject_area='Astrophysics')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Unanswered review assignment',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Astrophysics',
            },
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        updated = self.client.patch(
            reverse('publication-detail', args=[created.data['id']]),
            {'supervisor': replacement_supervisor.id},
            format='json',
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data['supervisor_id'], replacement_supervisor.id)
        self.assertFalse(PublicationReviewInvitation.objects.filter(
            publication_id=created.data['id'],
            reviewer=mapped_supervisor,
        ).exists())

    def test_owner_can_replace_declined_supervisor_invitation(self):
        declined_supervisor, _ = self.create_supervisor('declined-mapped-supervisor')
        replacement_supervisor, _ = self.create_supervisor('declined-replacement-supervisor')
        owner, _ = self.create_member('declined-assignment-owner')
        ReviewerSubjectArea.objects.create(reviewer=declined_supervisor, subject_area='Astrophysics')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Declined review assignment',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Astrophysics',
            },
            format='json',
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

        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data['supervisor_id'], replacement_supervisor.id)
        new_invitation = PublicationReviewInvitation.objects.get(
            publication_id=publication_id,
            reviewer=replacement_supervisor,
        )
        self.assertEqual(new_invitation.status, 'INVITED')



    def test_owner_cannot_replace_a_reviewer_after_acceptance(self):
        supervisor, _ = self.create_supervisor('accepted-assignment-supervisor')
        replacement_supervisor, _ = self.create_supervisor('accepted-replacement-supervisor')
        owner, _ = self.create_member('accepted-assignment-owner')
        ReviewerSubjectArea.objects.create(reviewer=supervisor, subject_area='Astrophysics')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Accepted review assignment',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Astrophysics',
            },
            format='json',
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
            {'username': 'self-reviewer', 'password': 'test-password', 'role': 'REVIEWER', 'department': 'Computing'},
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
        _, supervisor = self.create_supervisor()
        owner, _ = self.create_member('owner', supervisor)
        other_user, _ = self.create_member('other', supervisor)
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Owned paper', 'abstract': 'Abstract', 'pub_type': 'JOURNAL', 'subject_area': 'Computing', 'supervisor': supervisor.user_id},
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

    def test_owner_cannot_edit_approved_publication(self):
        owner, _ = self.create_member('approved-owner', None)
        publication = Publication.objects.create(
            title='Approved paper', owner=owner, abstract='Original abstract',
            pub_type='JOURNAL', subject_area='Computing', is_approved=True,
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

    def test_guest_can_view_approved_publication_inline_without_incrementing_downloads(self):
        owner = User.objects.create_user(username='public-view-owner', password='test-password')
        publication = Publication.objects.create(
            title='Public view paper', owner=owner, abstract='Abstract',
            pub_type='JOURNAL', subject_area='Computing', is_approved=True,
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
            pub_type='JOURNAL', subject_area='Computing', is_approved=True,
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

    def test_authenticated_repository_defaults_to_personal_items_and_searches_repository(self):
        member, _ = self.create_member('personal-repository-user')
        other_owner, _ = self.create_member('other-repository-owner')
        personal = Publication.objects.create(
            title='My private draft',
            owner=member,
            abstract='Personal draft abstract',
            pub_type='JOURNAL',
            subject_area='Computing',
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
            subject_area='Computing',
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
        reader, _ = self.create_member('approval-reader', role='LECTURER')

        self.client.force_authenticate(user=owner)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Approval paper',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computing',
            },
            format='json',
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
        self.client.force_authenticate(user=owner)
        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Revision test paper',
                'abstract': 'Initial abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computing',
                'supervisor': reviewer.id,
            },
            format='json',
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
            {'abstract': 'Revised abstract'},
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        publication = Publication.objects.get(pk=publication_id)
        self.assertEqual(publication.review_status, 'PENDING')
        self.assertEqual(publication.review_feedback, '')
        invitation = publication.review_invitations.get(reviewer=reviewer)
        self.assertEqual(invitation.decision, 'PENDING')

    def test_owner_can_clear_optional_co_supervisor(self):
        supervisor, _ = self.create_supervisor('primary-supervisor')
        co_supervisor, _ = self.create_supervisor('optional-co-supervisor')
        owner, _ = self.create_member('co-supervisor-owner')
        self.client.force_authenticate(user=owner)
        created = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Optional co-supervisor test',
                'abstract': 'Abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computing',
                'supervisor': supervisor.id,
                'co_supervisor': co_supervisor.id,
            },
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        updated = self.client.put(
            reverse('publication-detail', args=[created.data['id']]),
            {
                'title': 'Optional co-supervisor test',
                'abstract': 'Updated abstract',
                'pub_type': 'JOURNAL',
                'subject_area': 'Computing',
                'supervisor': str(supervisor.id),
                'co_supervisor': '',
            },
            format='multipart',
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertIsNone(updated.data['co_supervisor_id'])
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
        _, supervisor = self.create_supervisor('deletion-supervisor')
        owner, _ = self.create_member('deletion-owner', supervisor)
        other_user, _ = self.create_member('deletion-other', supervisor)
        self.client.force_authenticate(user=owner)
        create_response = self.client.post(
            reverse('publication-list'),
            {'title': 'Delete request paper', 'abstract': 'Abstract', 'pub_type': 'JOURNAL', 'subject_area': 'Computing', 'supervisor': supervisor.user_id},
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
        _, supervisor = self.create_supervisor('author-publication-supervisor')
        user, _ = self.create_member('multi-author-owner', supervisor)
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
                'supervisor': supervisor.user_id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        publication = Publication.objects.get(title='Collaborative paper')
        self.assertEqual(list(publication.authors.all()), [author])

    def test_login_access_token_authorizes_publication_upload(self):
        reviewer, supervisor = self.create_supervisor('token-supervisor')
        user, _ = self.create_member('token-student', supervisor)
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
                'supervisor': reviewer.id,
                'file_attachment': SimpleUploadedFile('jwt-paper.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_authenticated_user_can_upload_publication_without_authors_field(self):
        reviewer, supervisor = self.create_supervisor('upload-supervisor')
        user, _ = self.create_member('student', supervisor)
        self.client.force_authenticate(user=user)

        response = self.client.post(
            reverse('publication-list'),
            {
                'title': 'Upload test',
                'abstract': 'Testing the upload endpoint.',
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
        self.client.force_authenticate(user=user)
        url = reverse('publication-list') # matches router endpoint
        data = {
            'title': 'An Analysis of Computing Systems at UB',
            'abstract': 'This paper explores local server infrastructure...',
            'pub_type': 'JOURNAL',
            'subject_area': 'Computer Science',
            'supervisor': reviewer.id,
            'authors': []
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Publication.objects.count(), 1)
