from django.urls import path

from .views import (
    MarkAllNotificationsReadView,
    MarkNotificationReadView,
    NotificationDetailView,
    NotificationListView,
    MentorSendNotificationView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="mentor-notification-list"),
    path("send/", MentorSendNotificationView.as_view(), name="mentor-notification-send"),
    path("read-all/", MarkAllNotificationsReadView.as_view(), name="mentor-notification-read-all"),
    path("<int:pk>/", NotificationDetailView.as_view(), name="mentor-notification-detail"),
    path("<int:pk>/read/", MarkNotificationReadView.as_view(), name="mentor-notification-mark-read"),
]
