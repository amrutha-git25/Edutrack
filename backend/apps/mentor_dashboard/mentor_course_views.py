
from django.apps import apps
from django.db.models import Q

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _model(app_label, model_name):
    """Resolve existing EduTrack models without creating new tables."""
    try:
        return apps.get_model(app_label, model_name)
    except (LookupError, ValueError):
        return None


def _field_names(model):
    return {
        field.name
        for field in model._meta.get_fields()
        if getattr(field, "concrete", False)
    }


def _value(obj, names, default=None):
    """Return the first available non-empty attribute."""
    for name in names:
        value = getattr(obj, name, None)
        if value is not None and value != "":
            return value
    return default


def _file_url(request, value):
    if not value:
        return None

    try:
        value = value.url
    except (AttributeError, ValueError):
        value = str(value)

    if value.startswith(("http://", "https://")):
        return value

    if value.startswith("/"):
        return request.build_absolute_uri(value)

    return value or None


def _is_mentor(user):
    if not user or not user.is_authenticated:
        return False

    # EduTrack uses Django Groups for role membership.
    if user.groups.filter(name__iexact="MENTOR").exists():
        return True

    # Compatibility with a custom role attribute, if present.
    role = getattr(user, "role", None)
    role = getattr(role, "name", role)

    return str(role or "").strip().upper() == "MENTOR"


def _assigned_courses(user):
    """
    Get courses assigned to this mentor through the existing
    MentorAssignment model.

    MentorAssignment.mentor is a mentor profile with a related user.
    """
    Course = _model("courses", "Course")
    MentorAssignment = _model("courses", "MentorAssignment")

    if Course is None or MentorAssignment is None:
        return None, "Course or MentorAssignment model was not found."

    assignment_fields = _field_names(MentorAssignment)

    if not {"mentor", "course"}.issubset(assignment_fields):
        return None, (
            "MentorAssignment must contain mentor and course relationships."
        )

    course_ids = MentorAssignment.objects.filter(
        mentor__user=user
    ).values_list("course_id", flat=True).distinct()

    return Course.objects.filter(pk__in=course_ids), None


def _serialize_course(request, course):
    Course = _model("courses", "Course")
    Enrollment = _model("courses", "Enrollment")
    Topic = _model("courses", "Topic")

    course_fields = _field_names(Course)

    title = _value(
        course,
        ("title", "name", "course_name"),
        f"Course {course.pk}",
    )

    description = _value(
        course,
        ("description", "short_description", "overview"),
        "",
    )

    image = _value(
        course,
        ("thumbnail", "image", "cover_image", "course_image"),
    )

    data = {
        "id": course.pk,
        "title": str(title),
        "description": str(description or ""),
        "status": str(_value(course, ("status",), "") or ""),
        "category": str(
            _value(course, ("category", "subject"), "") or ""
        ),
        "level": str(
            _value(course, ("level", "difficulty"), "") or ""
        ),
        "image": _file_url(request, image),
        "created_at": (
            course.created_at.isoformat()
            if getattr(course, "created_at", None)
            else None
        ),
    }

    if Enrollment is not None and "course" in _field_names(Enrollment):
        data["enrolled_students"] = Enrollment.objects.filter(
            course_id=course.pk
        ).count()
    else:
        data["enrolled_students"] = None

    if Topic is not None and "course" in _field_names(Topic):
        data["topics_count"] = Topic.objects.filter(
            course_id=course.pk
        ).count()
    else:
        data["topics_count"] = None

    return data


class MentorCourseListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_mentor(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Mentor access is required.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        courses, error = _assigned_courses(request.user)

        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        search = request.query_params.get("search", "").strip()

        if search:
            course_fields = _field_names(_model("courses", "Course"))
            search_query = Q()

            for field in ("title", "name", "course_name", "description"):
                if field in course_fields:
                    search_query |= Q(**{f"{field}__icontains": search})

            if search_query:
                courses = courses.filter(search_query)

        courses = courses.distinct().order_by("pk")

        data = [
            _serialize_course(request, course)
            for course in courses
        ]

        return Response({
            "success": True,
            "count": len(data),
            "courses": data,
        })


class MentorCourseDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id):
        if not _is_mentor(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Mentor access is required.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        courses, error = _assigned_courses(request.user)

        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        course = courses.filter(pk=course_id).first()

        if course is None:
            # Do not disclose courses belonging to other mentors.
            return Response(
                {
                    "success": False,
                    "message": "Course not found in your assigned courses.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "success": True,
            "course": _serialize_course(request, course),
        })
