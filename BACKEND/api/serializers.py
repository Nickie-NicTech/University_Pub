from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from django.db import transaction
import re
from django.db.models import Sum
from .models import Publication, PublicationReviewInvitation, ReviewerSubjectArea, AuthorProfile, UserProfile, PublicationDeletionRequest, UserNotification, BroadcastMessage, UniversityDirectoryEntry

class RepositoryTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': 'STUDENT', 'department': ''},
        )
        token['role'] = profile.role
        return token


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name = serializers.CharField(source='user.last_name', required=False, allow_blank=True)
    email = serializers.EmailField(source='user.email', required=False, allow_blank=True)
    uploaded_materials = serializers.SerializerMethodField()
    approved_materials = serializers.SerializerMethodField()
    total_downloads = serializers.SerializerMethodField()
    pending_deletion_requests = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'username', 'first_name', 'last_name', 'email', 'role', 'department',
            'profile_picture', 'uploaded_materials', 'approved_materials',
            'total_downloads', 'pending_deletion_requests',
        ]
        read_only_fields = ['role', 'uploaded_materials', 'approved_materials', 'total_downloads', 'pending_deletion_requests']

    def validate_profile_picture(self, picture):
        allowed_types = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
        if picture.content_type not in allowed_types:
            raise serializers.ValidationError('Upload a JPEG, PNG, WebP, or GIF image.')
        if picture.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Profile images must be 5 MB or smaller.')
        return picture

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        for field, value in user_data.items():
            setattr(instance.user, field, value)
        if user_data:
            instance.user.save(update_fields=list(user_data.keys()))
        return super().update(instance, validated_data)

    def get_uploaded_materials(self, profile):
        return profile.user.owned_publications.count()

    def get_approved_materials(self, profile):
        return profile.user.owned_publications.filter(is_approved=True).count()

    def get_total_downloads(self, profile):
        return profile.user.owned_publications.aggregate(total=Sum('download_count'))['total'] or 0

    def get_pending_deletion_requests(self, profile):
        return profile.user.publication_deletion_requests.filter(status='PENDING').count()

class AuthorProfileSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = AuthorProfile
        fields = ['id', 'name', 'first_name', 'last_name', 'physical_address', 'occupation', 'department', 'institution']

    def get_name(self, obj):
        if obj.first_name or obj.last_name:
            return f"{obj.first_name} {obj.last_name}".strip()
        return obj.user.get_full_name() if obj.user else f"Author {obj.pk}"

class PublicationSerializer(serializers.ModelSerializer):
    authors = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=AuthorProfile.objects.all(),
        required=False,
    )
    authors_details = AuthorProfileSerializer(source='authors', many=True, read_only=True)
    supervisor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(profile__role='LECTURER', is_active=True),
        write_only=True,
        required=False,
    )
    co_supervisor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(profile__role='LECTURER', is_active=True),
        write_only=True,
        required=False,
        allow_null=True,
    )
    supervisor_id = serializers.SerializerMethodField()
    co_supervisor_id = serializers.SerializerMethodField()
    supervisor_name = serializers.SerializerMethodField()
    co_supervisor_name = serializers.SerializerMethodField()
    review_invitations = serializers.SerializerMethodField()
    review_invitation_status = serializers.SerializerMethodField()
    my_review_decision = serializers.SerializerMethodField()
    owner_username = serializers.CharField(source='owner.username', read_only=True, default=None)
    is_owner = serializers.SerializerMethodField()
    is_reviewer = serializers.SerializerMethodField()
    is_invited_reviewer = serializers.SerializerMethodField()

    class Meta:
        model = Publication
        fields = ['id', 'title', 'abstract', 'pub_type', 'subject_area', 'authors', 'authors_details', 'supervisor', 'co_supervisor', 'supervisor_id', 'co_supervisor_id', 'supervisor_name', 'co_supervisor_name', 'review_invitations', 'review_invitation_status', 'my_review_decision', 'file_attachment', 'download_count', 'upload_date', 'is_approved', 'review_status', 'review_feedback', 'owner_username', 'is_owner', 'is_reviewer', 'is_invited_reviewer']
        read_only_fields = ['supervisor_id', 'co_supervisor_id', 'download_count', 'is_approved', 'review_status', 'review_feedback', 'supervisor_name', 'co_supervisor_name', 'review_invitations', 'review_invitation_status', 'my_review_decision', 'owner_username', 'is_owner', 'is_reviewer', 'is_invited_reviewer', 'upload_date']

    def validate(self, attrs):
        if self.initial_data.get('co_supervisor') == '':
            attrs['co_supervisor'] = None
        request = self.context.get('request')
        supervisor = attrs.get('supervisor')
        co_supervisor = attrs.get('co_supervisor')
        subject_area = attrs.get('subject_area', self.instance.subject_area if self.instance else '')
        if self.instance:
            current = {
                invitation.role: invitation.reviewer
                for invitation in self.instance.review_invitations.select_related('reviewer')
            }
            invitations = {
                invitation.role: invitation
                for invitation in self.instance.review_invitations.all()
            }
            no_reviewers_responded = all(
                invitation.status == 'INVITED'
                for invitation in invitations.values()
            )
            supervisor = attrs.get('supervisor', current.get('SUPERVISOR'))
            co_supervisor = attrs.get('co_supervisor', current.get('CO_SUPERVISOR'))
            if subject_area != self.instance.subject_area and not any(
                field in attrs for field in ('supervisor', 'co_supervisor')
            ):
                supervisor, co_supervisor = self._mapped_reviewers(subject_area, request)
                attrs['supervisor'] = supervisor
                attrs['co_supervisor'] = co_supervisor

            for role, proposed in (
                ('SUPERVISOR', supervisor),
                ('CO_SUPERVISOR', co_supervisor),
            ):
                existing = current.get(role)
                if proposed == existing:
                    continue
                invitation = invitations.get(role)
                if invitation and invitation.status == 'ACCEPTED':
                    raise serializers.ValidationError({
                        'supervisor' if role == 'SUPERVISOR' else 'co_supervisor':
                        'This reviewer has accepted the invitation and cannot be replaced.'
                    })
                if invitation and invitation.status == 'INVITED' and not no_reviewers_responded:
                    raise serializers.ValidationError(
                        'Only declined reviewer invitations can be changed after a reviewer has responded.'
                    )
                if not invitation and not no_reviewers_responded and invitations:
                    raise serializers.ValidationError(
                        'A reviewer can only be added before any invited reviewer responds.'
                    )
        else:
            supervisor, co_supervisor = self._mapped_reviewers(subject_area, request)
            attrs['supervisor'] = supervisor
            attrs['co_supervisor'] = co_supervisor

        if co_supervisor and supervisor and co_supervisor.pk == supervisor.pk:
            raise serializers.ValidationError({'co_supervisor': 'The supervisor and co-supervisor must be different lecturers.'})
        if request and request.user.is_authenticated and (
            (supervisor and supervisor.pk == request.user.pk)
            or (co_supervisor and co_supervisor.pk == request.user.pk)
        ):
            raise serializers.ValidationError('You cannot assign yourself as your own publication reviewer.')
        if supervisor is not None:
            attrs['supervisor'] = supervisor
        if co_supervisor is not None or 'co_supervisor' in attrs:
            attrs['co_supervisor'] = co_supervisor
        return attrs

    def _mapped_reviewers(self, subject_area, request):
        mappings = ReviewerSubjectArea.objects.filter(
            subject_area__iexact=subject_area.strip(),
            reviewer__profile__role='LECTURER',
            reviewer__is_active=True,
        ).exclude(
            reviewer=request.user,
        ).select_related('reviewer').order_by('pk')
        reviewer = mappings.first()

        if not reviewer:
            raise serializers.ValidationError({
                'subject_area': 'No lecturer is mapped to this subject area. Contact an administrator to configure reviewer mappings.'
            })

        return reviewer.reviewer, None

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.owner_id == request.user.id)

    def _review_invitation_for_role(self, obj, role):
        return next((item for item in obj.review_invitations.all() if item.role == role), None)

    def get_supervisor_name(self, obj):
        invitation = self._review_invitation_for_role(obj, 'SUPERVISOR')
        return invitation.reviewer.get_full_name() or invitation.reviewer.username if invitation else ''

    def get_supervisor_id(self, obj):
        invitation = self._review_invitation_for_role(obj, 'SUPERVISOR')
        return invitation.reviewer_id if invitation else None

    def get_co_supervisor_id(self, obj):
        invitation = self._review_invitation_for_role(obj, 'CO_SUPERVISOR')
        return invitation.reviewer_id if invitation else None

    def get_co_supervisor_name(self, obj):
        invitation = self._review_invitation_for_role(obj, 'CO_SUPERVISOR')
        return invitation.reviewer.get_full_name() or invitation.reviewer.username if invitation else ''

    def get_review_invitations(self, obj):
        return PublicationReviewInvitationSerializer(
            obj.review_invitations.select_related('reviewer'),
            many=True,
        ).data

    def get_review_invitation_status(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return ''
        invitation = obj.review_invitations.filter(reviewer=request.user).first()
        return invitation.status if invitation else ''

    def get_my_review_decision(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return ''
        invitation = obj.review_invitations.filter(reviewer=request.user).first()
        return invitation.decision if invitation else ''

    def get_is_reviewer(self, obj):
        request = self.context.get('request')
        return bool(
            request and request.user.is_authenticated
            and obj.review_invitations.filter(reviewer=request.user, status='ACCEPTED').exists()
        )

    def get_is_invited_reviewer(self, obj):
        request = self.context.get('request')
        return bool(
            request and request.user.is_authenticated
            and obj.review_invitations.filter(reviewer=request.user, status='INVITED').exists()
        )

    def create(self, validated_data):
        owner = validated_data.pop('owner', self.context['request'].user)
        authors = validated_data.pop('authors', None)
        supervisor = validated_data.pop('supervisor')
        co_supervisor = validated_data.pop('co_supervisor', None)
        if not authors:
            user = self.context['request'].user
            try:
                department = user.profile.department
            except UserProfile.DoesNotExist:
                department = ''
            author, _ = AuthorProfile.objects.get_or_create(
                user=user,
                defaults={'department': department},
            )
            authors = [author]

        publication = Publication.objects.create(owner=owner, **validated_data)
        publication.authors.set(authors)
        PublicationReviewInvitation.objects.create(
            publication=publication,
            reviewer=supervisor,
            role='SUPERVISOR',
        )
        if co_supervisor:
            PublicationReviewInvitation.objects.create(
                publication=publication,
                reviewer=co_supervisor,
                role='CO_SUPERVISOR',
            )
        return publication

    def update(self, instance, validated_data):
        current = {
            invitation.role: invitation.reviewer
            for invitation in instance.review_invitations.select_related('reviewer')
        }
        supervisor = validated_data.pop('supervisor', current.get('SUPERVISOR'))
        co_supervisor = validated_data.pop('co_supervisor', current.get('CO_SUPERVISOR'))
        authors = validated_data.pop('authors', None)
        publication = super().update(instance, validated_data)
        if authors is not None:
            publication.authors.set(authors)
        for role, reviewer in [('SUPERVISOR', supervisor), ('CO_SUPERVISOR', co_supervisor)]:
            invitation = publication.review_invitations.filter(role=role).first()
            if reviewer is None:
                if invitation:
                    invitation.delete()
            elif invitation is None:
                PublicationReviewInvitation.objects.create(
                    publication=publication,
                    reviewer=reviewer,
                    role=role,
                )
            elif invitation.reviewer_id != reviewer.pk:
                invitation.reviewer = reviewer
                invitation.status = 'INVITED'
                invitation.decision = 'PENDING'
                invitation.feedback = ''
                invitation.responded_at = None
                invitation.save()
            elif invitation.status == 'DECLINED':
                invitation.status = 'INVITED'
                invitation.decision = 'PENDING'
                invitation.feedback = ''
                invitation.responded_at = None
                invitation.save()
        return publication


class PublicationReviewInvitationSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = PublicationReviewInvitation
        fields = ['id', 'reviewer', 'reviewer_name', 'role', 'status', 'decision', 'feedback', 'responded_at']

    def get_reviewer_name(self, invitation):
        return invitation.reviewer.get_full_name() or invitation.reviewer.username


class UserNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserNotification
        fields = ['id', 'title', 'message', 'link', 'created_at', 'read_at']
        read_only_fields = fields


class PublicationDeletionRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicationDeletionRequest
        fields = ['id', 'publication', 'requested_by', 'reason', 'status', 'requested_at']
        read_only_fields = ['id', 'publication', 'requested_by', 'status', 'requested_at']




class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    role = serializers.CharField(write_only=True)
    university_id = serializers.CharField(write_only=True, max_length=32)
    department = serializers.SerializerMethodField()

    def validate_role(self, role):
        if role not in {'STUDENT', 'LECTURER'}:
            raise serializers.ValidationError('New accounts must register as a student or lecturer.')
        return role

    def validate_university_id(self, university_id):
        university_id = university_id.strip()
        role = self.initial_data.get('role')
        if role == 'STUDENT' and not re.fullmatch(r'\d{9}', university_id):
            raise serializers.ValidationError('Student IDs must contain a four-digit year followed by five digits.')
        if role == 'LECTURER' and not re.fullmatch(r'[12]\d{7}', university_id):
            raise serializers.ValidationError('Employee IDs must contain eight digits and start with 1 or 2.')
        try:
            entry = UniversityDirectoryEntry.objects.get(university_id=university_id)
        except UniversityDirectoryEntry.DoesNotExist as error:
            raise serializers.ValidationError('This ID was not found in the University of Botswana directory.') from error
        if not entry.is_active:
            raise serializers.ValidationError('This university record is not active.')
        if entry.claimed_by_id:
            raise serializers.ValidationError('This university ID has already been used to register an account.')
        if entry.person_type != self.initial_data.get('role'):
            raise serializers.ValidationError('The selected account type does not match this university ID.')
        return entry

    class Meta:
        model = User
        fields = ['username', 'password', 'role', 'university_id', 'first_name', 'last_name', 'email', 'department']
        read_only_fields = ['first_name', 'last_name', 'email', 'department']

    def get_department(self, user):
        return user.profile.department

    def create(self, validated_data):
        role = validated_data.pop('role')
        directory_entry = validated_data.pop('university_id')
        with transaction.atomic():
            directory_entry = UniversityDirectoryEntry.objects.select_for_update().get(pk=directory_entry.pk)
            if not directory_entry.is_active or directory_entry.claimed_by_id:
                raise serializers.ValidationError({'university_id': 'This university ID is no longer available.'})
            user = User.objects.create_user(
                username=validated_data['username'],
                password=validated_data['password'],
                first_name=directory_entry.first_name,
                last_name=directory_entry.last_name,
                email=directory_entry.email,
            )
            UserProfile.objects.create(
                user=user,
                role=role,
                department=directory_entry.department,
            )
            directory_entry.claimed_by = user
            directory_entry.save(update_fields=['claimed_by'])
        return user


class BroadcastMessageSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = BroadcastMessage
        fields = ['id', 'title', 'message', 'created_by_username', 'created_at', 'is_active']
        read_only_fields = ['id', 'created_by_username', 'created_at']


class AdminUserSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username')
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name = serializers.CharField(source='user.last_name', required=False, allow_blank=True)
    email = serializers.EmailField(source='user.email', required=False, allow_blank=True)
    is_active = serializers.BooleanField(source='user.is_active', required=False)

    class Meta:
        model = UserProfile
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'role', 'department', 'is_active']

    def validate_role(self, role):
        if role not in {'STUDENT', 'LECTURER'}:
            raise serializers.ValidationError('Choose a supported non-admin role.')
        return role

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        for field, value in user_data.items():
            setattr(instance.user, field, value)
        if user_data:
            instance.user.save(update_fields=list(user_data.keys()))
        return super().update(instance, validated_data)


class AdminUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=['STUDENT', 'LECTURER'])
    department = serializers.CharField(required=False, allow_blank=True)

    def validate_username(self, username):
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError('That username is already in use.')
        return username

    def create(self, validated_data):
        password = validated_data.pop('password')
        role = validated_data.pop('role')
        department = validated_data.pop('department', '')
        user = User.objects.create_user(password=password, **validated_data)
        UserProfile.objects.create(
            user=user,
            role=role,
            department=department,
        )
        return UserProfile.objects.select_related('user').get(user=user)


class SupervisorSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    username = serializers.CharField(source='user.username', read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    is_subject_match = serializers.BooleanField(read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'user_id', 'name', 'username', 'department', 'is_subject_match']

    def get_name(self, profile):
        return profile.user.get_full_name() or profile.user.username


class UniversityDirectoryEntrySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    claimed_username = serializers.CharField(source='claimed_by.username', read_only=True, default=None)

    class Meta:
        model = UniversityDirectoryEntry
        fields = ['id', 'university_id', 'person_type', 'first_name', 'last_name', 'full_name', 'email', 'department', 'is_active', 'claimed_username', 'created_at']
        read_only_fields = fields

    def get_full_name(self, entry):
        return f'{entry.first_name} {entry.last_name}'.strip()
