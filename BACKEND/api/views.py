import secrets
import logging
from smtplib import SMTPException
from django.db.models import Exists, OuterRef, Q, F, Sum, Subquery
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from .models import Publication, PublicationReviewInvitation, ReviewerSubjectArea, AuthorProfile, PublicationDeletionRequest, UserProfile, UserNotification, BroadcastMessage, UniversityDirectoryEntry
from .serializers import PublicationSerializer, AuthorProfileSerializer, UserRegistrationSerializer, PublicationDeletionRequestSerializer, UserProfileSerializer, UserNotificationSerializer, BroadcastMessageSerializer, AdminUserSerializer, AdminUserCreateSerializer, UniversityDirectoryEntrySerializer, SupervisorSerializer
import random
from django.contrib.auth.models import User
from rest_framework import generics, permissions
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RepositoryTokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)


def notify_user(recipient, subject, message, link=''):
    UserNotification.objects.create(user=recipient, title=subject, message=message, link=link)
    if not recipient.email:
        return 'An in-app notification was saved, but this user has no email address.'
    try:
        sent_count = send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [recipient.email],
            fail_silently=False,
        )
    except (SMTPException, OSError):
        logger.exception('Unable to send publication review email to user %s.', recipient.pk)
        return 'An in-app notification was saved, but the email could not be sent.'
    if sent_count != 1:
        logger.error('Publication review email was not sent to user %s.', recipient.pk)
        return 'An in-app notification was saved, but the email could not be sent.'
    return ''


def refresh_review_status(publication):
    invitations = publication.review_invitations.all()
    accepted = invitations.filter(status='ACCEPTED')
    has_pending_invitations = invitations.filter(status='INVITED').exists()

    if not accepted.exists():
        publication.review_status = 'PENDING_INVITATIONS' if has_pending_invitations else 'REVIEWER_DECLINED'
        publication.is_approved = False
    elif has_pending_invitations or accepted.filter(decision='PENDING').exists():
        publication.review_status = 'PENDING'
        publication.is_approved = False
    elif accepted.filter(decision='REVISION_REQUESTED').exists():
        publication.review_status = 'REVISION_REQUESTED'
        publication.is_approved = False
    else:
        publication.review_status = 'APPROVED'
        publication.is_approved = True

    publication.review_feedback = '\n\n'.join(
        f'{invitation.reviewer.get_full_name() or invitation.reviewer.username}: {invitation.feedback.strip()}'
        for invitation in accepted.select_related('reviewer').order_by('created_at', 'pk')
        if invitation.feedback.strip()
    )
    publication.save(update_fields=['review_status', 'is_approved', 'review_feedback'])


class RepositoryTokenObtainPairView(TokenObtainPairView):
    serializer_class = RepositoryTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        username = str(request.data.get('username', ''))
        password = str(request.data.get('password', ''))

        if username == settings.ADMIN_PORTAL_USERNAME:
            configured_password = settings.ADMIN_PORTAL_PASSWORD
            if not configured_password:
                return Response(
                    {'detail': 'Set UNIPUB_ADMIN_PASSWORD in the backend environment before signing in.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            if not secrets.compare_digest(password, configured_password):
                return Response({'detail': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)

            user, _ = User.objects.get_or_create(username=settings.ADMIN_PORTAL_USERNAME)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.save(update_fields=['is_staff', 'is_superuser', 'is_active'])
            UserProfile.objects.update_or_create(
                user=user,
                defaults={'role': 'ADMIN', 'department': 'Administration'},
            )
            refresh = RepositoryTokenObtainPairSerializer.get_token(user)
            return Response({'refresh': str(refresh), 'access': str(refresh.access_token)})

        return super().post(request, *args, **kwargs)

class PublicationViewSet(viewsets.ModelViewSet):
    queryset = Publication.objects.all().order_by('-upload_date')
    serializer_class = PublicationSerializer

    def get_queryset(self):
        queryset = Publication.objects.all().order_by('-upload_date')
        queryset = queryset.prefetch_related('review_invitations__reviewer', 'authors')
        user = self.request.user
        highlight_mode = (
            self.action == 'list'
            and self.request.query_params.get('highlights', '').lower() == 'true'
        )
        review_assignment_mode = (
            self.action == 'list'
            and self.request.query_params.get('review_assignments', '').lower() == 'true'
            and user.is_authenticated
        )
        if review_assignment_mode:
            queryset = queryset.filter(review_invitations__reviewer=user).distinct()
        elif highlight_mode or not user.is_authenticated:
            queryset = queryset.filter(is_approved=True)
        elif not user.is_staff:
            queryset = queryset.filter(
                Q(is_approved=True)
                | Q(owner=user)
                | Q(review_invitations__reviewer=user)
            ).distinct()

        search_query = self.request.query_params.get('search', '').strip()
        if search_query:
            supported_fields = {
                'title': Q(title__icontains=search_query),
                'abstract': Q(abstract__icontains=search_query),
                'subject_area': Q(subject_area__icontains=search_query),
                'author': (
                    Q(authors__first_name__icontains=search_query)
                    | Q(authors__last_name__icontains=search_query)
                ),
            }
            requested_fields = self.request.query_params.getlist('search_in')
            search_fields = set(requested_fields) if requested_fields else set(supported_fields)
            search_filter = Q()
            for field in search_fields & supported_fields.keys():
                search_filter |= supported_fields[field]
            queryset = queryset.filter(search_filter).distinct() if search_filter else queryset.none()

        publication_types = self.request.query_params.getlist('pub_type')
        if publication_types:
            queryset = queryset.filter(pub_type__in=publication_types)

        author_query = self.request.query_params.get('author', '').strip()
        if author_query:
            queryset = queryset.filter(
                Q(authors__first_name__icontains=author_query)
                | Q(authors__last_name__icontains=author_query)
            ).distinct()

        subject_area = self.request.query_params.get('subject_area', '').strip()
        if subject_area:
            queryset = queryset.filter(subject_area__icontains=subject_area)

        has_search_filters = bool(
            search_query
            or publication_types
            or author_query
            or subject_area
        )
        if (
            self.action == 'list'
            and user.is_authenticated
            and not has_search_filters
            and not highlight_mode
            and not review_assignment_mode
        ):
            queryset = queryset.filter(owner=user)
        return queryset

    def perform_update(self, serializer):
        publication = self.get_object()
        if publication.owner_id != self.request.user.id:
            raise PermissionDenied('Only the publication owner may edit this record.')
        if publication.is_approved or publication.review_status == 'APPROVED':
            raise PermissionDenied('Approved publications cannot be edited.')
        if publication.review_status == 'PENDING' and publication.review_invitations.filter(status='ACCEPTED').exists():
            raise PermissionDenied('Wait for your accepted reviewers to request revisions before changing this publication.')
        previously_invited = set(
            publication.review_invitations.filter(status='INVITED').values_list('reviewer_id', flat=True)
        )
        resubmitting = publication.review_status == 'REVISION_REQUESTED'
        publication = serializer.save(is_approved=False, review_feedback='')
        accepted = publication.review_invitations.filter(status='ACCEPTED')
        if resubmitting:
            accepted.update(decision='PENDING', feedback='')
        refresh_review_status(publication)
        self._notification_warning = ''
        invitees = publication.review_invitations.filter(status='INVITED').exclude(
            reviewer_id__in=previously_invited
        ).select_related('reviewer')
        for invitation in invitees:
            warning = notify_user(
                invitation.reviewer,
                f'Publication review invitation: {publication.title}',
                f'{publication.owner.get_full_name() or publication.owner.username} invited you to review "{publication.title}" as {invitation.get_role_display().lower()}.',
                f'/lecturer/reviews?publication={publication.pk}',
            )
            self._notification_warning = self._notification_warning or warning
        if resubmitting:
            for invitation in accepted.select_related('reviewer'):
                warning = notify_user(
                    invitation.reviewer,
                    f'Publication resubmitted: {publication.title}',
                    f'{publication.owner.get_full_name() or publication.owner.username} revised "{publication.title}" and resubmitted it for your review.',
                    f'/lecturer/reviews?publication={publication.pk}',
                )
                self._notification_warning = self._notification_warning or warning

    def perform_create(self, serializer):
        profile = UserProfile.objects.filter(user=self.request.user).first()
        if not profile or profile.role not in {'STUDENT', 'LECTURER'}:
            raise PermissionDenied('Only students and lecturers may submit publications.')
        publication = serializer.save(owner=self.request.user)
        publication.review_status = 'PENDING_INVITATIONS'
        publication.save(update_fields=['review_status'])
        self._notification_warning = ''
        for invitation in publication.review_invitations.select_related('reviewer'):
            warning = notify_user(
                invitation.reviewer,
                f'Publication review invitation: {publication.title}',
                f'{self.request.user.get_full_name() or self.request.user.username} invited you to review "{publication.title}" as {invitation.get_role_display().lower()}.',
                f'/lecturer/reviews?publication={publication.pk}',
            )
            self._notification_warning = self._notification_warning or warning

    def create(self, request, *args, **kwargs):
        self._notification_warning = ''
        response = super().create(request, *args, **kwargs)
        if self._notification_warning:
            response.data['notification_warning'] = self._notification_warning
        return response

    def update(self, request, *args, **kwargs):
        self._notification_warning = ''
        response = super().update(request, *args, **kwargs)
        if self._notification_warning:
            response.data['notification_warning'] = self._notification_warning
        return response

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Permanent deletion is disabled. Owners may submit a deletion request.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        publication = self.get_object()
        if not publication.file_attachment:
            raise NotFound('This publication has no attached file.')
        Publication.objects.filter(pk=publication.pk).update(download_count=F('download_count') + 1)
        return FileResponse(publication.file_attachment.open('rb'), as_attachment=True)

    @action(detail=True, methods=['get'], url_path='view')
    def view(self, request, pk=None):
        publication = self.get_object()
        if not publication.file_attachment:
            raise NotFound('This publication has no attached file.')
        return FileResponse(
            publication.file_attachment.open('rb'),
            as_attachment=False,
            filename=publication.file_attachment.name.rsplit('/', 1)[-1],
            content_type='application/pdf',
        )

    @action(detail=True, methods=['post'], url_path='review-invitation')
    def review_invitation(self, request, pk=None):
        publication = self.get_object()
        invitation = publication.review_invitations.filter(reviewer=request.user).first()
        if not invitation:
            raise PermissionDenied('You are not invited to review this publication.')
        if invitation.status != 'INVITED':
            return Response({'detail': 'This review invitation has already been answered.'}, status=status.HTTP_409_CONFLICT)
        decision = request.data.get('decision')
        if decision not in {'ACCEPTED', 'DECLINED'}:
            return Response({'decision': ['Choose ACCEPTED or DECLINED.']}, status=status.HTTP_400_BAD_REQUEST)
        invitation.status = decision
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=['status', 'responded_at'])
        refresh_review_status(publication)
        response_data = dict(self.get_serializer(publication).data)
        if publication.review_status == 'APPROVED':
            title = f'Publication approved: {publication.title}'
            message = (
                f'The remaining accepted reviewer approved "{publication.title}", and all other invited '
                'reviewers declined. The publication is now available in the repository.'
            )
        elif publication.review_status == 'REVISION_REQUESTED':
            title = f'Revisions requested: {publication.title}'
            message = (
                f'Your reviewers requested revisions for "{publication.title}":\n\n'
                f'{publication.review_feedback}\n\nPlease revise and resubmit your publication.'
            )
        else:
            title = f'Reviewer invitation {decision.lower()}: {publication.title}'
            message = (
                f'{request.user.get_full_name() or request.user.username} {decision.lower()} the invitation '
                f'to review "{publication.title}".'
            )
        warning = notify_user(
            publication.owner,
            title,
            message,
            f'/?publication={publication.pk}',
        )
        if warning:
            response_data['notification_warning'] = warning
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='review-decision')
    def review_decision(self, request, pk=None):
        publication = self.get_object()
        invitation = publication.review_invitations.filter(
            reviewer=request.user,
            status='ACCEPTED',
        ).first()
        if not invitation:
            raise PermissionDenied('Accept this publication’s invitation before reviewing it.')
        if publication.review_status != 'PENDING':
            return Response({'detail': 'This publication is not currently accepting reviewer decisions.'}, status=status.HTTP_409_CONFLICT)
        if invitation.decision != 'PENDING':
            return Response({'detail': 'You have already submitted a review decision.'}, status=status.HTTP_409_CONFLICT)
        decision = request.data.get('decision')
        if decision not in {'APPROVED', 'REVISION_REQUESTED'}:
            return Response({'decision': ['Choose APPROVED or REVISION_REQUESTED.']}, status=status.HTTP_400_BAD_REQUEST)
        feedback = request.data.get('feedback', '')
        if decision == 'REVISION_REQUESTED' and (
            not isinstance(feedback, str) or len(feedback.strip()) < 5
        ):
            return Response({'feedback': ['Provide feedback of at least five characters.']}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(feedback, str):
            return Response({'feedback': ['Feedback must be text.']}, status=status.HTTP_400_BAD_REQUEST)
        invitation.decision = decision
        invitation.feedback = feedback.strip()
        invitation.save(update_fields=['decision', 'feedback'])
        refresh_review_status(publication)
        if publication.review_status == 'REVISION_REQUESTED':
            title = f'Revisions requested: {publication.title}'
            message = (
                f'Your reviewers requested revisions for "{publication.title}":\n\n'
                f'{publication.review_feedback}\n\nPlease revise and resubmit your publication.'
            )
        elif decision == 'REVISION_REQUESTED':
            title = f'Reviewer feedback received: {publication.title}'
            message = (
                f'{request.user.get_full_name() or request.user.username} provided feedback on '
                f'"{publication.title}":\n\n{invitation.feedback}\n\n'
                "The overall outcome is pending the remaining reviewers' decisions."
            )
        elif publication.is_approved:
            title = f'Publication approved: {publication.title}'
            message = f'All accepted reviewers approved "{publication.title}". It is now published in the repository.'
        else:
            title = f'Reviewer approved: {publication.title}'
            message = f'{request.user.get_full_name() or request.user.username} approved "{publication.title}". It is waiting for other reviewers.'
        response_data = dict(self.get_serializer(publication).data)
        link = f'/?publication={publication.pk}'
        warning = notify_user(publication.owner, title, message, link)
        if warning:
            response_data['notification_warning'] = warning
        return Response(response_data)

    @action(detail=True, methods=['post'], url_path='request-deletion')
    def request_deletion(self, request, pk=None):
        publication = self.get_object()
        if publication.owner_id != request.user.id:
            raise PermissionDenied('Only the publication owner may request deletion.')
        if publication.deletion_requests.filter(status='PENDING').exists():
            return Response({'detail': 'A deletion request is already pending.'}, status=status.HTTP_409_CONFLICT)

        deletion_request = PublicationDeletionRequest.objects.create(
            publication=publication,
            requested_by=request.user,
            reason=request.data.get('reason', ''),
        )
        return Response(PublicationDeletionRequestSerializer(deletion_request).data, status=status.HTTP_201_CREATED)

class AuthorViewSet(viewsets.ModelViewSet):
    queryset = AuthorProfile.objects.all()
    serializer_class = AuthorProfileSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        search_query = self.request.query_params.get('search', '').strip()
        if search_query:
            queryset = queryset.filter(
                Q(first_name__icontains=search_query)
                | Q(last_name__icontains=search_query)
                | Q(physical_address__icontains=search_query)
                | Q(occupation__icontains=search_query)
                | Q(department__icontains=search_query)
                | Q(institution__icontains=search_query)
                | Q(user__first_name__icontains=search_query)
                | Q(user__last_name__icontains=search_query)
            ).distinct()
        return queryset





class UserRegistrationView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny] # Guests must be allowed to access this endpoint


class CurrentUserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(
            user=self.request.user,
            defaults={'role': 'STUDENT', 'department': ''},
        )
        return profile

class SubjectAreaListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        subject_areas = [
            {
                'value': value,
                'label': label,
            }
            for value, label in Publication.SUBJECT_AREA_CHOICES
        ]
        return Response(subject_areas)

class SupervisorListView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = SupervisorSerializer

    def get_queryset(self):
        subject_area = self.request.query_params.get('subject_area', '').strip()
        subject_matches = ReviewerSubjectArea.objects.filter(
            reviewer_id=OuterRef('user_id'),
            subject_area__iexact=subject_area,
        )
        subject_mapping_order = ReviewerSubjectArea.objects.filter(
            reviewer_id=OuterRef('user_id'),
            subject_area__iexact=subject_area,
        ).order_by('pk').values('pk')[:1]
        queryset = UserProfile.objects.select_related('user').filter(
            role='LECTURER',
            user__is_active=True,
        ).annotate(
            is_subject_match=Exists(subject_matches),
            subject_mapping_order=Subquery(subject_mapping_order),
        ).order_by(
            '-is_subject_match',
            'subject_mapping_order',
            'user__last_name',
            'user__first_name',
            'user__username',
        )
        if self.request.user.is_authenticated:
            queryset = queryset.exclude(user=self.request.user)
        return queryset


class UserNotificationListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserNotificationSerializer

    def get_queryset(self):
        return UserNotification.objects.filter(user=self.request.user)


class UserNotificationReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        notification = get_object_or_404(UserNotification, pk=pk, user=request.user)
        notification.read_at = timezone.now()
        notification.save(update_fields=['read_at'])
        return Response(UserNotificationSerializer(notification).data)


class AdminPortalLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = str(request.data.get('username', ''))
        password = str(request.data.get('password', ''))
        configured_password = settings.ADMIN_PORTAL_PASSWORD
        if not configured_password:
            return Response(
                {'detail': 'Set UNIPUB_ADMIN_PASSWORD in the backend environment before signing in.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not (
            secrets.compare_digest(username, settings.ADMIN_PORTAL_USERNAME)
            and secrets.compare_digest(password, configured_password)
        ):
            return Response({'detail': 'Invalid administrator credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        user, _ = User.objects.get_or_create(username=settings.ADMIN_PORTAL_USERNAME)
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save(update_fields=['is_staff', 'is_superuser', 'is_active'])
        UserProfile.objects.update_or_create(
            user=user,
            defaults={'role': 'ADMIN', 'department': 'Administration'},
        )
        refresh = RepositoryTokenObtainPairSerializer.get_token(user)
        return Response({'refresh': str(refresh), 'access': str(refresh.access_token)})


class AdminUserListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        for user in User.objects.exclude(pk=self.request.user.pk).iterator():
            UserProfile.objects.get_or_create(user=user, defaults={'department': ''})
        return UserProfile.objects.select_related('user').exclude(user__is_superuser=True).order_by('user__username')

    def get_serializer_class(self):
        return AdminUserCreateSerializer if self.request.method == 'POST' else AdminUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(AdminUserSerializer(profile).data, status=status.HTTP_201_CREATED)


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = AdminUserSerializer
    queryset = UserProfile.objects.select_related('user').exclude(user__is_superuser=True)

    def perform_destroy(self, instance):
        if instance.user_id == self.request.user.id:
            raise PermissionDenied('You cannot remove the active administrator account.')
        instance.user.delete()

class AdminAnalyticsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({
            'users': User.objects.filter(is_staff=False).count(),
            'supervisors': UserProfile.objects.filter(role='LECTURER').count(),
            'publications': Publication.objects.count(),
            'approved_publications': Publication.objects.filter(is_approved=True).count(),
            'pending_publications': Publication.objects.filter(review_status__in=['PENDING_INVITATIONS', 'PENDING', 'REVISION_REQUESTED']).count(),
            'downloads': Publication.objects.aggregate(total=Sum('download_count'))['total'] or 0,
        })

class AdminUniversityDirectoryView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        entries = UniversityDirectoryEntry.objects.select_related('claimed_by').all()
        person_type = request.query_params.get('person_type')
        if person_type in {'STUDENT', 'LECTURER'}:
            entries = entries.filter(person_type=person_type)
        return Response(UniversityDirectoryEntrySerializer(entries, many=True).data)

    def post(self, request):
        try:
            count = int(request.data.get('count', 30))
        except (TypeError, ValueError):
            return Response({'count': ['Enter a whole number.']}, status=status.HTTP_400_BAD_REQUEST)
        if count < 1 or count > 500:
            return Response({'count': ['Generate between 1 and 500 records at a time.']}, status=status.HTTP_400_BAD_REQUEST)

        names = {
            'first': ['Amantle', 'Boitumelo', 'Dineo', 'Gofaone', 'Kagiso', 'Keneilwe', 'Lesego', 'Naledi', 'Onalenna', 'Thato', 'Tshepo', 'Tumelo'],
            'last': ['Banda', 'Kgosidintsi', 'Molefe', 'Motswagole', 'Phiri', 'Ramoabi', 'Seboni', 'Tlhagale', 'Tshukudu', 'Williams'],
        }
        departments = ['Computer Science', 'Business', 'Education', 'Engineering', 'Health Sciences', 'Humanities', 'Law', 'Social Sciences']
        created = []
        year_prefix = str(timezone.now().year)
        student_ids = UniversityDirectoryEntry.objects.filter(
            person_type='STUDENT', university_id__startswith=year_prefix,
        ).values_list('university_id', flat=True)
        next_student_number = max(
            (int(value[4:]) for value in student_ids if len(value) == 9 and value[4:].isdigit()),
            default=0,
        ) + 1
        employee_ids = UniversityDirectoryEntry.objects.filter(person_type='LECTURER').values_list('university_id', flat=True)
        next_employee_number = max(
            (int(value) for value in employee_ids if len(value) == 8 and value[0] in {'1', '2'} and value.isdigit()),
            default=10_000_000,
        ) + 1
        for index in range(count):
            person_type = 'STUDENT' if index % 4 else 'LECTURER'
            if person_type == 'STUDENT':
                if next_student_number > 99_999:
                    return Response({'count': ['The current-year student ID sequence is full.']}, status=status.HTTP_409_CONFLICT)
                university_id = f'{year_prefix}{next_student_number:05d}'
                next_student_number += 1
            else:
                if next_employee_number > 29_999_999:
                    next_employee_number = 20_000_000
                university_id = f'{next_employee_number:08d}'
                next_employee_number += 1
                while UniversityDirectoryEntry.objects.filter(university_id=university_id).exists():
                    if next_employee_number > 29_999_999:
                        next_employee_number = 20_000_000
                    university_id = f'{next_employee_number:08d}'
                    next_employee_number += 1
            entry = UniversityDirectoryEntry.objects.create(
                university_id=university_id,
                person_type=person_type,
                first_name=random.choice(names['first']),
                last_name=random.choice(names['last']),
                email=f"{university_id}@ub.ac.bw",
                department=random.choice(departments),
            )
            created.append(entry)
        return Response(UniversityDirectoryEntrySerializer(created, many=True).data, status=status.HTTP_201_CREATED)


class BroadcastMessageView(APIView):
    def get_permissions(self):
        return [permissions.IsAdminUser() if self.request.method == 'POST' else permissions.IsAuthenticated()]

    def get(self, request):
        messages = BroadcastMessage.objects.filter(is_active=True)
        return Response(BroadcastMessageSerializer(messages, many=True).data)

    def post(self, request):
        serializer = BroadcastMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(created_by=request.user)
        return Response(BroadcastMessageSerializer(message).data, status=status.HTTP_201_CREATED)
class AdminBroadcastListView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        messages = BroadcastMessage.objects.select_related('created_by').all()
        return Response(BroadcastMessageSerializer(messages, many=True).data)

    def post(self, request):
        serializer = BroadcastMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(created_by=request.user)
        return Response(BroadcastMessageSerializer(message).data, status=status.HTTP_201_CREATED)


class AdminBroadcastDetailView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def patch(self, request, pk):
        message = get_object_or_404(BroadcastMessage, pk=pk)
        serializer = BroadcastMessageSerializer(message, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        message = get_object_or_404(BroadcastMessage, pk=pk)
        message.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
