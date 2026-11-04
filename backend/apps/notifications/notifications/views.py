
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


def _role(user):
    value = getattr(user, "role", "")
    if hasattr(value, "name"):
        value = value.name
    elif hasattr(value, "value"):
        value = value.value
    return str(value or "").strip().lower()


def is_admin_user(user):
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or _role(user) == "admin"
            or user.groups.filter(name__iexact="ADMIN").exists()
        )
    )


def is_student_user(user):
    if not user or not user.is_authenticated:
        return False

    return (
        _role(user) == "student"
        or user.groups.filter(name__iexact="STUDENT").exists()
        or hasattr(user, "student_profile")
    )


def is_mentor_user(user):
    if not user or not user.is_authenticated:
        return False

    return (
        _role(user) == "mentor"
        or user.groups.filter(name__iexact="MENTOR").exists()
        or hasattr(user, "mentor_profile")
    )


def has_notification_access(user):
    return (
        is_admin_user(user)
        or is_student_user(user)
        or is_mentor_user(user)
    )


class AdminNotificationPermission(IsAuthenticated):
    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and is_admin_user(request.user)
        )


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        if not has_notification_access(request.user):
            return Response(
                {"success": False, "message": "Access denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        filter_value = (
            request.query_params.get("filter")
            or request.query_params.get("status")
            or "all"
        ).strip().lower()

        if filter_value not in {"all", "read", "unread"}:
            return Response(
                {
                    "success": False,
                    "message": "Filter must be all, read, or unread.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = Notification.objects.filter(
            recipient=request.user
        ).order_by("-created_at")

        if filter_value == "read":
            queryset = queryset.filter(is_read=True)
        elif filter_value == "unread":
            queryset = queryset.filter(is_read=False)

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

        serialized = NotificationSerializer(queryset, many=True).data
        return Response({
            "success": True,
            "notifications": serialized,
            "unread_count": unread_count,
            # Keep the existing response format for other consumers.
            "data": serialized,
            "meta": {
                "total": queryset.count(),
                "unread_count": unread_count,
                "filter": filter_value,
            },
        })


class NotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not has_notification_access(request.user):
            return Response(
                {"success": False, "message": "Access denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        notification = get_object_or_404(
            Notification,
            pk=pk,
            recipient=request.user,
        )

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])

        return Response({
            "success": True,
            "data": NotificationSerializer(notification).data,
        })


class MarkNotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not has_notification_access(request.user):
            return Response(
                {"success": False, "message": "Access denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        notification = get_object_or_404(
            Notification,
            pk=pk,
            recipient=request.user,
        )

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])

        return Response({
            "success": True,
            "message": "Notification marked as read.",
            "data": NotificationSerializer(notification).data,
        })

    def post(self, request, pk):
        return self.patch(request, pk)


class MarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (is_student_user(request.user) or is_mentor_user(request.user)):
            return Response(
                {"success": False, "message": "Student or mentor access is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).update(is_read=True)

        return Response({
            "success": True,
            "message": "All notifications marked as read.",
            "data": {"updated_count": count, "unread_count": 0},
        })


class AdminSendNotificationView(APIView):
    permission_classes = [AdminNotificationPermission]

    def post(self, request):
        title = str(request.data.get("title", "")).strip()
        message = str(request.data.get("message", "")).strip()
        notification_type = (
            str(request.data.get("notification_type", "general")).strip()
            or "general"
        )
        recipient_ids = request.data.get("recipient_ids", [])
        send_to_all = request.data.get("send_to_all_students", False)

        if not title or not message:
            return Response(
                {
                    "success": False,
                    "message": "Title and message are required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(title) > 200:
            return Response(
                {
                    "success": False,
                    "message": "Title cannot exceed 200 characters.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(send_to_all, bool) or not isinstance(
            recipient_ids, list
        ):
            return Response(
                {
                    "success": False,
                    "message": (
                        "send_to_all_students must be boolean and "
                        "recipient_ids must be a list."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if send_to_all and recipient_ids:
            return Response(
                {
                    "success": False,
                    "message": "Choose all students or selected recipients.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()

        # Existing Student profile relation in EduTrack.
        if send_to_all:
            recipients = User.objects.filter(
                is_active=True,
                student_profile__isnull=False,
            ).distinct()

        elif recipient_ids:
            try:
                ids = {int(value) for value in recipient_ids}
            except (TypeError, ValueError):
                return Response(
                    {
                        "success": False,
                        "message": "Recipient IDs must be integers.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            recipients = User.objects.filter(
                pk__in=ids,
                is_active=True,
                student_profile__isnull=False,
            ).distinct()

            if set(recipients.values_list("pk", flat=True)) != ids:
                return Response(
                    {
                        "success": False,
                        "message": (
                            "One or more IDs do not belong to active "
                            "student accounts."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {
                    "success": False,
                    "message": "Select students or choose all students.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipients = list(recipients)

        if not recipients:
            return Response(
                {
                    "success": False,
                    "message": "No eligible students found.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = 0
        emails_sent = 0
        email_failures = 0
        missing_emails = 0

        for recipient in recipients:
            Notification.objects.create(
                recipient=recipient,
                title=title,
                message=message,
                notification_type=notification_type,
            )
            created += 1

            email = (getattr(recipient, "email", "") or "").strip()
            if not email:
                missing_emails += 1
                continue

            try:
                result = send_mail(
                    subject=title,
                    message=message,
                    from_email=getattr(
                        settings, "DEFAULT_FROM_EMAIL", None
                    ),
                    recipient_list=[email],
                    fail_silently=False,
                )
                if result == 1:
                    emails_sent += 1
                else:
                    email_failures += 1
            except Exception:
                email_failures += 1

        return Response({
            "success": True,
            "message": "In-app notifications created.",
            "recipients_processed": len(recipients),
            "notifications_created": created,
            "emails_sent": emails_sent,
            "email_failures": email_failures,
            "recipients_without_email": missing_emails,
        })


def _model_field_names(model):
    return {
        field.name: field
        for field in model._meta.get_fields()
        if getattr(field, "concrete", False)
    }


def _mentor_assigned_course_ids(user):
    """
    Return IDs from the existing courses.MentorAssignment model.
    The project mentor-course API uses MentorAssignment.mentor__user=user.
    """
    from django.apps import apps

    try:
        Assignment = apps.get_model("courses", "MentorAssignment")
    except (LookupError, ValueError):
        return None, "The courses.MentorAssignment model was not found."

    fields = _model_field_names(Assignment)
    if "mentor" not in fields or "course" not in fields:
        return None, "MentorAssignment must contain mentor and course fields."

    try:
        ids = list(
            Assignment.objects.filter(mentor__user=user)
            .values_list("course_id", flat=True)
            .distinct()
        )
    except Exception:
        return None, (
            "Could not resolve this mentor's assigned courses. "
            "Check MentorAssignment.mentor and its user relationship."
        )

    return ids, None


def _students_for_courses(course_ids):
    """
    Return active User IDs enrolled in at least one of the supplied courses.
    Supports Enrollment.student/user pointing either to User or Student profile.
    """
    from django.apps import apps

    User = get_user_model()
    try:
        Enrollment = apps.get_model("courses", "Enrollment")
    except (LookupError, ValueError):
        return None, "The courses.Enrollment model was not found."

    fields = _model_field_names(Enrollment)
    course_field = fields.get("course")
    student_field = next(
        (
            fields.get(name)
            for name in ("student", "user", "student_profile", "learner")
            if fields.get(name) is not None
            and getattr(fields[name], "is_relation", False)
        ),
        None,
    )

    if (
        course_field is None
        or not getattr(course_field, "is_relation", False)
        or student_field is None
    ):
        return None, (
            "Enrollment needs a course relation and a student/user relation. "
            "Check apps.courses.models.Enrollment."
        )

    try:
        enrollments = Enrollment.objects.filter(
            **{f"{course_field.name}_id__in": course_ids}
        ).select_related(student_field.name)

        related_model = student_field.related_model
        if related_model == User:
            user_ids = enrollments.values_list(
                f"{student_field.name}_id", flat=True
            )
            return User.objects.filter(
                pk__in=user_ids, is_active=True
            ).distinct(), None

        # Student profile relation: resolve its FK/OneToOne to the User model.
        profile_fields = _model_field_names(related_model)
        profile_user_field = next(
            (
                profile_fields.get(name)
                for name in ("user", "account", "auth_user")
                if profile_fields.get(name) is not None
                and getattr(profile_fields[name], "is_relation", False)
                and profile_fields[name].related_model == User
            ),
            None,
        )
        if profile_user_field is None:
            return None, (
                "Enrollment's student profile has no user/account relation."
            )

        user_ids = enrollments.values_list(
            f"{student_field.name}__{profile_user_field.name}_id",
            flat=True,
        )
        return User.objects.filter(
            pk__in=user_ids, is_active=True
        ).distinct(), None
    except Exception:
        return None, (
            "Could not resolve enrolled students. Verify the Enrollment "
            "student and course relationship fields."
        )


class MentorSendNotificationView(APIView):
    """
    Create in-app notifications for students enrolled in the mentor's
    assigned courses. Does not require email settings and creates no new model.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_mentor_user(request.user):
            return Response(
                {"success": False, "message": "Mentor access is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        title = str(request.data.get("title", "")).strip()
        message = str(request.data.get("message", "")).strip()
        notification_type = (
            str(request.data.get("notification_type", "general")).strip()
            or "general"
        )

        if not title or not message:
            return Response(
                {"success": False, "message": "Title and message are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(title) > 200:
            return Response(
                {"success": False, "message": "Title cannot exceed 200 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        send_to_all = request.data.get("send_to_all_students", False)
        if send_to_all is not True:
            return Response(
                {
                    "success": False,
                    "message": (
                        "Choose 'students in my assigned courses' to send "
                        "this notification."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        course_ids, error = _mentor_assigned_course_ids(request.user)
        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if not course_ids:
            return Response(
                {
                    "success": False,
                    "message": "No courses are assigned to your mentor account.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipients, error = _students_for_courses(course_ids)
        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        recipients = list(recipients)
        if not recipients:
            return Response(
                {
                    "success": False,
                    "message": "No students are enrolled in your assigned courses.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        Notification.objects.bulk_create([
            Notification(
                recipient=recipient,
                title=title,
                message=message,
                notification_type=notification_type,
            )
            for recipient in recipients
        ])

        return Response(
            {
                "success": True,
                "message": "Notification sent to students in your assigned courses.",
                "recipients_processed": len(recipients),
                "notifications_created": len(recipients),
            },
            status=status.HTTP_201_CREATED,
        )

