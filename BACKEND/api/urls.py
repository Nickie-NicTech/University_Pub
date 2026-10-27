from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PublicationViewSet, AuthorViewSet, UserRegistrationView, CurrentUserProfileView, SupervisorListView, SubjectAreaListView, UserNotificationListView, UserNotificationReadView, AdminPortalLoginView, AdminUserListCreateView, AdminUserDetailView, AdminAnalyticsView, AdminUniversityDirectoryView, BroadcastMessageView, AdminBroadcastListView, AdminBroadcastDetailView

router = DefaultRouter()
router.register(r'publications', PublicationViewSet)
router.register(r'authors', AuthorViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('users/register/', UserRegistrationView.as_view(), name='user_register'),
    path('users/me/', CurrentUserProfileView.as_view(), name='current_user_profile'),
    path('users/supervisors/', SupervisorListView.as_view(), name='supervisor_list'),
    path('subject-areas/', SubjectAreaListView.as_view(), name='subject_area_list'),
    path('users/notifications/', UserNotificationListView.as_view(), name='user_notifications'),
    path('users/notifications/<int:pk>/read/', UserNotificationReadView.as_view(), name='user_notification_read'),
    path('admin/users/', AdminUserListCreateView.as_view(), name='admin_user_list'),
    path('admin/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin_user_detail'),
    path('admin/analytics/', AdminAnalyticsView.as_view(), name='admin_analytics'),
    path('admin/university-directory/', AdminUniversityDirectoryView.as_view(), name='admin_university_directory'),
    path('admin/broadcasts/', AdminBroadcastListView.as_view(), name='admin_broadcast_list'),
    path('admin/broadcasts/<int:pk>/', AdminBroadcastDetailView.as_view(), name='admin_broadcast_detail'),
    path('broadcasts/', BroadcastMessageView.as_view(), name='broadcast_list'),

]
