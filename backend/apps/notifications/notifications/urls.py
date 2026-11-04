
from django.urls import path

from .views import (
    AdminSendNotificationView,
    MarkAllNotificationsReadView,
    MarkNotificationReadView,
    NotificationDetailView,
    NotificationListView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("send/", AdminSendNotificationView.as_view(), name="notification-send"),
    path(
        "read-all/",
        MarkAllNotificationsReadView.as_view(),
        name="notification-read-all",
    ),
    path("<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
    path(
        "<int:pk>/read/",
        MarkNotificationReadView.as_view(),
        name="notification-mark-read",
    ),
]
