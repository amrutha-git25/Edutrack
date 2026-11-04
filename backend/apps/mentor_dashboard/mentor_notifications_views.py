
from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.notifications.models import Notification


def is_mentor(user):
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="MENTOR").exists():
        return True

    role = getattr(user, "role", "")
    role = getattr(role, "name", role)
    role = getattr(role, "value", role)

    return str(role or "").strip().lower() == "mentor"


def mentor_permission_error(request):
    if not is_mentor(request.user):
        return Response(
            {
                "success": False,
                "message": "Mentor access is required.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    return None


def notification_data(notification):
    return {
        "id": notification.pk,
        "title": notification.title,
        "message": notification.message,
        "notification_type": notification.notification_type,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


class MentorNotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        error = mentor_permission_error(request)
        if error:
            return error

        queryset = Notification.objects.filter(
            recipient=request.user
        )

        status_filter = request.query_params.get(
            "status", "all"
        ).strip().lower()

        if status_filter == "read":
            queryset = queryset.filter(is_read=True)
        elif status_filter == "unread":
            queryset = queryset.filter(is_read=False)
        elif status_filter != "all":
            return Response(
                {
                    "success": False,
                    "message": "Status must be all, read, or unread.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(message__icontains=search)
                | Q(notification_type__icontains=search)
            )

        unread_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).count()

        notifications = [
            notification_data(item)
            for item in queryset.order_by("-created_at", "-id")
        ]

        return Response({
            "success": True,
            "notifications": notifications,
            "unread_count": unread_count,
            "total": len(notifications),
        })


class MentorNotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, notification_id):
        error = mentor_permission_error(request)
        if error:
            return error

        notification = get_object_or_404(
            Notification,
            pk=notification_id,
            recipient=request.user,
        )

        # Opening an unread notification marks it as read.
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])

        return Response({
            "success": True,
            "notification": notification_data(notification),
        })


class MentorNotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        error = mentor_permission_error(request)
        if error:
            return error

        notification = get_object_or_404(
            Notification,
            pk=notification_id,
            recipient=request.user,
        )

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])

        return Response({
            "success": True,
            "message": "Notification marked as read.",
            "notification": notification_data(notification),
        })


class MentorMarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        error = mentor_permission_error(request)
        if error:
            return error

        updated_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).update(is_read=True)

        return Response({
            "success": True,
            "message": "All notifications marked as read.",
            "updated_count": updated_count,
        })
