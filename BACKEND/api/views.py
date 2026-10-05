import secrets
from django.db.models import Q, F, Sum
from django.utils import timezone
from django.conf import settings
from django.utils import timezone
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from .models import Publication, AuthorProfile, PublicationDeletionRequest, UserProfile, ReviewerApplication, BroadcastMessage, UniversityDirectoryEntry
from .serializers import PublicationSerializer, AuthorProfileSerializer, UserRegistrationSerializer, PublicationDeletionRequestSerializer, UserProfileSerializer, ReviewerApplicationSerializer, BroadcastMessageSerializer, AdminUserSerializer, AdminUserCreateSerializer, UniversityDirectoryEntrySerializer
import random
from django.contrib.auth.models import User
from rest_framework import generics, permissions
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RepositoryTokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

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
        user = self.request.user
        is_reviewer = user.is_authenticated and (
            user.is_staff or getattr(getattr(user, 'profile', None), 'role', None) == 'REVIEWER'
        )
        if user.is_authenticated and not is_reviewer:
            queryset = queryset.filter(Q(is_approved=True) | Q(owner=user))
        elif not is_reviewer:
            queryset = queryset.filter(is_approved=True)

        search_query = self.request.query_params.get('search', None)
        if search_query:
            queryset = queryset.filter(
                Q(title__icontains=search_query)
                | Q(subject_area__icontains=search_query)
                | Q(abstract__icontains=search_query)
                | Q(authors__first_name__icontains=search_query)
                | Q(authors__last_name__icontains=search_query)
            ).distinct()
        return queryset

    def perform_update(self, serializer):
        publication = self.get_object()
        if publication.owner_id != self.request.user.id:
            raise PermissionDenied('Only the publication owner may edit this record.')
        serializer.save(is_approved=False, review_status='PENDING', rejection_reason='')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

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
        return HttpResponseRedirect(publication.file_attachment.url)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        publication = self.get_object()
        profile = getattr(request.user, 'profile', None)
        if not (request.user.is_staff or (profile and profile.role == 'REVIEWER')):
            raise PermissionDenied('Only a reviewer may approve publications.')
        if publication.owner_id == request.user.id:
            raise PermissionDenied('Reviewers cannot approve their own publications.')
        if publication.review_status != 'PENDING':
            return Response({'detail': 'Only pending publications can be approved.'}, status=status.HTTP_409_CONFLICT)
        publication.is_approved = True
        publication.review_status = 'APPROVED'
        publication.rejection_reason = ''
        publication.save(update_fields=['is_approved', 'review_status', 'rejection_reason'])
        return Response(self.get_serializer(publication).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        publication = self.get_object()
        profile = getattr(request.user, 'profile', None)
        if not (request.user.is_staff or (profile and profile.role == 'REVIEWER')):
            raise PermissionDenied('Only a reviewer may reject publications.')
        if publication.owner_id == request.user.id:
            raise PermissionDenied('Reviewers cannot reject their own publications.')
        if publication.review_status != 'PENDING':
            return Response({'detail': 'Only pending publications can be rejected.'}, status=status.HTTP_409_CONFLICT)
        reason = request.data.get('reason', '')
        if not isinstance(reason, str) or not reason.strip():
            return Response({'reason': ['Provide a reason for rejecting this publication.']}, status=status.HTTP_400_BAD_REQUEST)
        publication.is_approved = False
        publication.review_status = 'REJECTED'
        publication.rejection_reason = reason.strip()
        publication.save(update_fields=['is_approved', 'review_status', 'rejection_reason'])
        return Response(self.get_serializer(publication).data)

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


class ReviewerApplicationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        application = ReviewerApplication.objects.filter(user=request.user).first()
        return Response(ReviewerApplicationSerializer(application).data if application else None)

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user, defaults={'department': ''})
        if profile.role in {'REVIEWER', 'ADMIN'}:
            return Response({'detail': 'Your account already has reviewer permissions.'}, status=status.HTTP_409_CONFLICT)
        if ReviewerApplication.objects.filter(user=request.user, status='PENDING').exists():
            return Response({'detail': 'You already have a pending reviewer request.'}, status=status.HTTP_409_CONFLICT)
        serializer = ReviewerApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = serializer.save(user=request.user)
        return Response(ReviewerApplicationSerializer(application).data, status=status.HTTP_201_CREATED)


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


class AdminReviewerApplicationListView(generics.ListAPIView):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = ReviewerApplicationSerializer
    queryset = ReviewerApplication.objects.select_related('user', 'user__profile').all()


class AdminReviewerApplicationDetailView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def patch(self, request, pk):
        application = get_object_or_404(ReviewerApplication.objects.select_related('user'), pk=pk)
        decision = request.data.get('status')
        if decision not in {'APPROVED', 'REJECTED'}:
            return Response({'detail': 'Choose APPROVED or REJECTED.'}, status=status.HTTP_400_BAD_REQUEST)
        application.status = decision
        application.reviewed_by = request.user
        application.reviewed_at = timezone.now()
        application.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
        if decision == 'APPROVED':
            profile, _ = UserProfile.objects.get_or_create(user=application.user, defaults={'department': ''})
            profile.role = 'REVIEWER'
            profile.save(update_fields=['role'])
        return Response(ReviewerApplicationSerializer(application).data)


class AdminAnalyticsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({
            'users': User.objects.filter(is_staff=False).count(),
            'reviewers': UserProfile.objects.filter(role='REVIEWER').count(),
            'pending_reviewer_requests': ReviewerApplication.objects.filter(status='PENDING').count(),
            'publications': Publication.objects.count(),
            'approved_publications': Publication.objects.filter(is_approved=True).count(),
            'pending_publications': Publication.objects.filter(is_approved=False).count(),
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
