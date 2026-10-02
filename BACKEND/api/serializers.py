from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from django.db import transaction
import re
from django.db.models import Sum
from .models import Publication, AuthorProfile, UserProfile, PublicationDeletionRequest, ReviewerApplication, BroadcastMessage, UniversityDirectoryEntry

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
    owner_username = serializers.CharField(source='owner.username', read_only=True, default=None)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Publication
        fields = ['id', 'title', 'abstract', 'pub_type', 'subject_area', 'authors', 'authors_details', 'file_attachment', 'download_count', 'upload_date', 'is_approved', 'review_status', 'rejection_reason', 'owner_username', 'is_owner']
        read_only_fields = ['download_count', 'is_approved', 'review_status', 'rejection_reason', 'owner_username', 'is_owner', 'upload_date']

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and obj.owner_id == request.user.id)

    def create(self, validated_data):
        owner = validated_data.pop('owner', self.context['request'].user)
        authors = validated_data.pop('authors', None)
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
        return publication


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


class ReviewerApplicationSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    department = serializers.CharField(source='user.profile.department', read_only=True)

    class Meta:
        model = ReviewerApplication
        fields = ['id', 'username', 'department', 'expertise', 'reason', 'status', 'created_at', 'reviewed_at']
        read_only_fields = ['id', 'username', 'department', 'status', 'created_at', 'reviewed_at']


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
        if role not in {'STUDENT', 'LECTURER', 'REVIEWER'}:
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
    role = serializers.ChoiceField(choices=['STUDENT', 'LECTURER', 'REVIEWER'])
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

class UniversityDirectoryEntrySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    claimed_username = serializers.CharField(source='claimed_by.username', read_only=True, default=None)

    class Meta:
        model = UniversityDirectoryEntry
        fields = ['id', 'university_id', 'person_type', 'first_name', 'last_name', 'full_name', 'email', 'department', 'is_active', 'claimed_username', 'created_at']
        read_only_fields = fields

    def get_full_name(self, entry):
        return f'{entry.first_name} {entry.last_name}'.strip()
