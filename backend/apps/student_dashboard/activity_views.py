from django.utils import timezone
from django.db import transaction

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.courses.courses.models import Enrollment, Material
from apps.student_dashboard.models import StudentLearningActivity
from apps.users.users.models import Student


def is_student(user):
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)

    return str(role or "").strip().lower() == "student"


def student_error(message, code):
    return Response(
        {
            "success": False,
            "message": message,
        },
        status=code,
    )


def get_student_and_material(request, material_id):
    """
    Verify student profile, published material,
    and active/completed course enrollment.
    """

    try:
        student = Student.objects.get(user=request.user)
    except Student.DoesNotExist:
        return None, None, student_error(
            "No Student profile is linked to this account.",
            status.HTTP_404_NOT_FOUND,
        )

    try:
        material = Material.objects.select_related(
            "topic",
            "topic__course",
        ).get(
            pk=material_id,
            is_published=True,
        )
    except Material.DoesNotExist:
        return None, None, student_error(
            "Published learning material was not found.",
            status.HTTP_404_NOT_FOUND,
        )

    enrollment_exists = Enrollment.objects.filter(
        student=student,
        course=material.topic.course,
        status__in=["active", "completed"],
    ).exists()

    if not enrollment_exists:
        return None, None, student_error(
            "You are not enrolled in this course.",
            status.HTTP_403_FORBIDDEN,
        )

    return student, material, None


def parse_non_negative_integer(value, field_name):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"{field_name} must be a valid integer."
        )

    if number < 0:
        raise ValueError(
            f"{field_name} cannot be negative."
        )

    return number


class StudentLearningActivityView(APIView):
    """
    GET:
        List the logged-in student's learning activities.

    POST:
        Create or update video/document learning progress.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):

        if not is_student(request.user):
            return student_error(
                "Student access is required.",
                status.HTTP_403_FORBIDDEN,
            )

        activities = (
            StudentLearningActivity.objects
            .filter(student=request.user)
            .select_related("course", "material")
            .order_by("-last_activity_at")
        )

        results = []

        for activity in activities:
            results.append({
                "id": activity.id,
                "course_id": activity.course_id,
                "course_title": activity.course.title,
                "material_id": activity.material_id,
                "material_title": (
                    activity.material.title
                    if activity.material
                    else None
                ),
                "activity_type": activity.activity_type,
                "duration_seconds": activity.duration_seconds,
                "last_position_seconds": (
                    activity.last_position_seconds
                ),
                "media_duration_seconds": (
                    activity.media_duration_seconds
                ),
                "progress_percentage": float(
                    activity.progress_percentage
                ),
                "is_completed": activity.is_completed,
                "last_activity_at": activity.last_activity_at,
                "completed_at": activity.completed_at,
            })

        return Response({
            "success": True,
            "count": len(results),
            "results": results,
        })

    def post(self, request):

        if not is_student(request.user):
            return student_error(
                "Student access is required.",
                status.HTTP_403_FORBIDDEN,
            )

        material_id = request.data.get("material_id")

        if not material_id:
            return student_error(
                "material_id is required.",
                status.HTTP_400_BAD_REQUEST,
            )

        student, material, error = get_student_and_material(
            request,
            material_id,
        )

        if error:
            return error

        activity_type = str(
            request.data.get("activity_type", "")
        ).strip().lower()

        if activity_type not in ["video", "document"]:
            return student_error(
                "activity_type must be video or document.",
                status.HTTP_400_BAD_REQUEST,
            )

        # Validate material type and file extension.
        material_type = str(
            material.material_type or ""
        ).lower()

        file_name = ""

        if material.file:
            file_name = material.file.name.lower()

        video_extensions = (
            ".mp4",
            ".webm",
            ".ogg",
            ".mov",
            ".m4v",
        )

        document_extensions = (
            ".pdf",
            ".ppt",
            ".pptx",
            ".doc",
            ".docx",
            ".xls",
            ".xlsx",
            ".txt",
            ".csv",
        )

        is_video = (
            material_type == "video"
            or file_name.endswith(video_extensions)
        )

        is_document = (
            material_type in ["document", "presentation"]
            or file_name.endswith(document_extensions)
        )

        if activity_type == "video" and not is_video:
            return student_error(
                "This material is not a video.",
                status.HTTP_400_BAD_REQUEST,
            )

        if activity_type == "document" and not is_document:
            return student_error(
                "This material is not a supported document.",
                status.HTTP_400_BAD_REQUEST,
            )

        # Validate tracking values.
        try:
            duration_seconds = parse_non_negative_integer(
                request.data.get("duration_seconds", 0),
                "duration_seconds",
            )

            last_position_seconds = parse_non_negative_integer(
                request.data.get("last_position_seconds", 0),
                "last_position_seconds",
            )

            media_duration_seconds = parse_non_negative_integer(
                request.data.get("media_duration_seconds", 0),
                "media_duration_seconds",
            )

        except ValueError as exc:
            return student_error(
                str(exc),
                status.HTTP_400_BAD_REQUEST,
            )

        if duration_seconds > 43200:
            return student_error(
                "Activity duration cannot exceed 12 hours.",
                status.HTTP_400_BAD_REQUEST,
            )

        if media_duration_seconds > 86400:
            return student_error(
                "Media duration is invalid.",
                status.HTTP_400_BAD_REQUEST,
            )

        if (
            media_duration_seconds > 0
            and last_position_seconds > media_duration_seconds
        ):
            last_position_seconds = media_duration_seconds

        # Calculate progress.
        if activity_type == "video":

            if media_duration_seconds <= 0:
                return student_error(
                    "A valid video duration is required.",
                    status.HTTP_400_BAD_REQUEST,
                )

            position_progress = (
                last_position_seconds / media_duration_seconds
            ) * 100

            watched_progress = (
                duration_seconds / media_duration_seconds
            ) * 100

            progress = min(
                100,
                round(
                    min(position_progress, watched_progress),
                    2,
                ),
            )

            is_completed = (
                last_position_seconds
                >= media_duration_seconds * 0.90
                and duration_seconds
                >= media_duration_seconds * 0.90
            )

        else:
            requested_completion = (
                request.data.get("is_completed") is True
                or str(
                    request.data.get("is_completed", "")
                ).lower() == "true"
            )

            is_completed = (
                requested_completion
                and duration_seconds >= 30
            )

            progress = 100 if is_completed else 0

        # IMPORTANT: Define now for BOTH video and document activities.
        now = timezone.now()

        # Create or update activity.
        with transaction.atomic():

            activity = (
                StudentLearningActivity.objects
                .select_for_update()
                .filter(
                    student=request.user,
                    course=material.topic.course,
                    material=material,
                    activity_type=activity_type,
                )
                .first()
            )

            created = activity is None

            if created:
                activity = StudentLearningActivity(
                    student=request.user,
                    course=material.topic.course,
                    material=material,
                    activity_type=activity_type,
                    started_at=now,
                )

            # Preserve cumulative duration.
            activity.duration_seconds = max(
                activity.duration_seconds,
                duration_seconds,
            )

            # Preserve the furthest recorded playback position.
            activity.last_position_seconds = max(
                activity.last_position_seconds,
                last_position_seconds,
            )

            activity.media_duration_seconds = max(
                activity.media_duration_seconds,
                media_duration_seconds,
            )

            # Progress must never decrease.
            activity.progress_percentage = max(
                activity.progress_percentage,
                progress,
            )

            # Once completed, keep the activity completed.
            activity.is_completed = (
                activity.is_completed or is_completed
            )

            activity.last_activity_at = now

            if (
                activity.is_completed
                and not activity.completed_at
            ):
                activity.completed_at = now

            activity.save()

        return Response(
            {
                "success": True,
                "message": (
                    "Learning activity created."
                    if created
                    else "Learning activity updated."
                ),
                "data": {
                    "id": activity.id,
                    "course_id": activity.course_id,
                    "material_id": activity.material_id,
                    "activity_type": activity.activity_type,
                    "duration_seconds": (
                        activity.duration_seconds
                    ),
                    "last_position_seconds": (
                        activity.last_position_seconds
                    ),
                    "media_duration_seconds": (
                        activity.media_duration_seconds
                    ),
                    "progress_percentage": float(
                        activity.progress_percentage
                    ),
                    "is_completed": activity.is_completed,
                    "last_activity_at": (
                        activity.last_activity_at
                    ),
                },
            },
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            ),
        )


class StudentMaterialProgressView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, material_id):

        if not is_student(request.user):
            return student_error(
                "Student access is required.",
                status.HTTP_403_FORBIDDEN,
            )

        student, material, error = get_student_and_material(
            request,
            material_id,
        )

        if error:
            return error

        activity = StudentLearningActivity.objects.filter(
            student=request.user,
            course=material.topic.course,
            material=material,
        ).first()

        if not activity:
            return Response({
                "success": True,
                "data": {
                    "material_id": material.id,
                    "duration_seconds": 0,
                    "last_position_seconds": 0,
                    "media_duration_seconds": 0,
                    "progress_percentage": 0,
                    "is_completed": False,
                },
            })

        return Response({
            "success": True,
            "data": {
                "material_id": material.id,
                "duration_seconds": activity.duration_seconds,
                "last_position_seconds": (
                    activity.last_position_seconds
                ),
                "media_duration_seconds": (
                    activity.media_duration_seconds
                ),
                "progress_percentage": float(
                    activity.progress_percentage
                ),
                "is_completed": activity.is_completed,
            },
        })