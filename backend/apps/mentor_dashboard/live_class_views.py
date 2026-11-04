
from django.utils import timezone
from django.db.models import Q

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsMentor
from apps.learning.learning.models import LiveClass
from apps.courses.courses.models import Course, MentorAssignment


def mentor_assigned_course_names(user):
    """Return course titles assigned to this mentor."""
    names = set()

    # Support projects where Course has a direct mentor field.
    try:
        Course._meta.get_field("mentor")
        direct_courses = Course.objects.filter(mentor=user)
        names.update(
            direct_courses.values_list("title", flat=True)
        )
    except Exception:
        pass

    # Support the MentorAssignment -> MentorProfile relationship.
    assignments = MentorAssignment.objects.filter(
        mentor__user=user
    ).select_related("course")

    names.update(
        assignments.values_list("course__title", flat=True)
    )

    return {name for name in names if name}


class MentorLiveClassSerializer(serializers.ModelSerializer):
    mentor_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LiveClass
        fields = [
            "id",
            "title",
            "description",
            "course_name",
            "mentor",
            "mentor_name",
            "scheduled_at",
            "duration_minutes",
            "meeting_url",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "mentor",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def get_mentor_name(self, obj):
        return (
            obj.mentor.get_full_name()
            or obj.mentor.get_username()
        )

    def get_created_by_name(self, obj):
        return (
            obj.created_by.get_full_name()
            or obj.created_by.get_username()
        )

    def validate_course_name(self, value):
        value = value.strip()
        allowed_courses = mentor_assigned_course_names(
            self.context["request"].user
        )

        if not value or value not in allowed_courses:
            raise serializers.ValidationError(
                "Select a course assigned to your mentor account."
            )

        return value

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Class title is required."
            )
        return value

    def validate_duration_minutes(self, value):
        if not 1 <= value <= 600:
            raise serializers.ValidationError(
                "Duration must be between 1 and 600 minutes."
            )
        return value

    def validate_meeting_url(self, value):
        if value and not value.startswith(("https://", "http://")):
            raise serializers.ValidationError(
                "Enter a valid meeting URL beginning with http:// or https://."
            )
        return value

    def validate_scheduled_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError(
                "Schedule the live class for a future date and time."
            )
        return value

    def validate_status(self, value):
        allowed = {"scheduled", "live", "completed", "cancelled"}
        if value not in allowed:
            raise serializers.ValidationError(
                "Invalid live class status."
            )
        return value


class MentorLiveClassListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def get(self, request):
        assigned_courses = mentor_assigned_course_names(request.user)

        queryset = LiveClass.objects.filter(
            mentor=request.user,
            course_name__in=assigned_courses,
        ).select_related("mentor", "created_by").order_by(
            "scheduled_at"
        )

        class_status = request.query_params.get("status")
        if class_status in {
            "scheduled", "live", "completed", "cancelled"
        }:
            queryset = queryset.filter(status=class_status)

        upcoming_only = request.query_params.get("upcoming")
        if upcoming_only == "true":
            queryset = queryset.filter(
                scheduled_at__gte=timezone.now(),
                status="scheduled",
            )

        serializer = MentorLiveClassSerializer(
            queryset,
            many=True,
            context={"request": request},
        )

        return Response({
            "success": True,
            "count": queryset.count(),
            "results": serializer.data,
        })

    def post(self, request):
        serializer = MentorLiveClassSerializer(
            data=request.data,
            context={"request": request},
        )

        serializer.is_valid(raise_exception=True)

        live_class = serializer.save(
            mentor=request.user,
            created_by=request.user,
            status="scheduled",
        )

        return Response(
            {
                "success": True,
                "message": "Live class scheduled successfully.",
                "class": MentorLiveClassSerializer(
                    live_class,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MentorLiveClassDetailView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def get_object(self, request, class_id):
        assigned_courses = mentor_assigned_course_names(request.user)

        return LiveClass.objects.filter(
            id=class_id,
            mentor=request.user,
            course_name__in=assigned_courses,
        ).first()

    def get(self, request, class_id):
        live_class = self.get_object(request, class_id)

        if live_class is None:
            return Response(
                {"detail": "Live class not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "success": True,
            "class": MentorLiveClassSerializer(
                live_class,
                context={"request": request},
            ).data,
        })

    def patch(self, request, class_id):
        live_class = self.get_object(request, class_id)

        if live_class is None:
            return Response(
                {"detail": "Live class not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if live_class.status in {"completed", "cancelled"}:
            return Response(
                {"detail": "Completed or cancelled classes cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mentors can cancel a class through PATCH.
        if request.data.get("status") == "cancelled":
            live_class.status = "cancelled"
            live_class.save(update_fields=["status", "updated_at"])

            return Response({
                "success": True,
                "message": "Live class cancelled successfully.",
                "class": MentorLiveClassSerializer(
                    live_class,
                    context={"request": request},
                ).data,
            })

        serializer = MentorLiveClassSerializer(
            live_class,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({
            "success": True,
            "message": "Live class updated successfully.",
            "class": serializer.data,
        })

    def delete(self, request, class_id):
        live_class = self.get_object(request, class_id)

        if live_class is None:
            return Response(
                {"detail": "Live class not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if live_class.status == "completed":
            return Response(
                {"detail": "A completed class cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Soft cancellation preserves class and attendance history.
        live_class.status = "cancelled"
        live_class.save(update_fields=["status", "updated_at"])

        return Response({
            "success": True,
            "message": "Live class cancelled successfully.",
        })


class MentorLiveClassStartView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def post(self, request, class_id):
        assigned_courses = mentor_assigned_course_names(request.user)

        live_class = LiveClass.objects.filter(
            id=class_id,
            mentor=request.user,
            course_name__in=assigned_courses,
        ).first()

        if live_class is None:
            return Response(
                {"detail": "Live class not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if live_class.status == "cancelled":
            return Response(
                {"detail": "This class has been cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if live_class.status == "completed":
            return Response(
                {"detail": "This class has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not live_class.meeting_url:
            return Response(
                {
                    "detail": (
                        "Add a meeting URL before starting the class."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if live_class.scheduled_at > timezone.now():
            return Response(
                {
                    "detail": (
                        "This class is scheduled for the future. "
                        "You can start it at its scheduled time."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        live_class.status = "live"
        live_class.save(update_fields=["status", "updated_at"])

        return Response({
            "success": True,
            "message": "Class is live. Open the meeting link to join.",
            "meeting_url": live_class.meeting_url,
            "class": MentorLiveClassSerializer(
                live_class,
                context={"request": request},
            ).data,
        })
