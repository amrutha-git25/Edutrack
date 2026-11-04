
from django.apps import apps
from django.db.models import Q
from django.utils import timezone

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MentorPreference, MentorActivity
from .permissions import IsMentor
from .serializers import (
    MentorPreferenceSerializer,
    MentorActivitySerializer,
)


def get_model(model_name, preferred_app=None):
    """Find an existing model without creating or changing database tables."""
    if preferred_app:
        try:
            model = apps.get_model(preferred_app, model_name)
            if model is not None:
                return model
        except (LookupError, ValueError):
            pass

    for model in apps.get_models():
        if model.__name__ == model_name:
            return model

    return None


def model_fields(model):
    if model is None:
        return set()

    return {
        field.name
        for field in model._meta.get_fields()
        if getattr(field, "concrete", False)
    }


def field_value(obj, names, default=None):
    for name in names:
        value = getattr(obj, name, None)
        if value is not None and value != "":
            return value
    return default


def get_mentor_courses(user):
    """
    Support both:
      Course.mentor -> User
      MentorAssignment.mentor -> MentorProfile -> User
    """
    Course = get_model("Course", "courses")
    MentorAssignment = get_model("MentorAssignment", "courses")

    if Course is None:
        return None, "Course model was not found."

    course_fields = model_fields(Course)
    course_ids = set()

    if "mentor" in course_fields:
        course_ids.update(
            Course.objects.filter(mentor=user).values_list(
                "pk", flat=True
            )
        )

    if MentorAssignment is not None:
        assignment_fields = model_fields(MentorAssignment)

        if {"mentor", "course"}.issubset(assignment_fields):
            try:
                assigned_ids = MentorAssignment.objects.filter(
                    mentor__user=user
                ).values_list("course_id", flat=True)

                course_ids.update(assigned_ids)
            except Exception:
                # Keep direct Course.mentor assignments usable.
                pass

    return Course.objects.filter(pk__in=course_ids).distinct(), None


def get_course_students(course_ids, user):
    """Count distinct students associated with the mentor's courses."""
    MentorAssignment = get_model("MentorAssignment", "courses")
    Enrollment = get_model("Enrollment", "courses")

    if MentorAssignment is not None:
        fields = model_fields(MentorAssignment)

        if {"mentor", "student", "course"}.issubset(fields):
            try:
                return MentorAssignment.objects.filter(
                    mentor__user=user,
                    course_id__in=course_ids,
                ).values("student_id").distinct().count()
            except Exception:
                pass

    if Enrollment is not None:
        fields = model_fields(Enrollment)

        if {"student", "course"}.issubset(fields):
            try:
                queryset = Enrollment.objects.filter(
                    course_id__in=course_ids
                )

                if "status" in fields:
                    queryset = queryset.filter(status="active")

                return queryset.values("student_id").distinct().count()
            except Exception:
                pass

    return 0


def serialize_course(course, user):
    Enrollment = get_model("Enrollment", "courses")
    Topic = get_model("Topic", "courses")

    student_count = 0
    module_count = 0

    if Enrollment is not None and "course" in model_fields(Enrollment):
        try:
            enrollments = Enrollment.objects.filter(course_id=course.pk)

            if "status" in model_fields(Enrollment):
                enrollments = enrollments.filter(status="active")

            student_count = enrollments.values(
                "student_id"
            ).distinct().count()
        except Exception:
            pass

    if Topic is not None and "course" in model_fields(Topic):
        module_count = Topic.objects.filter(
            course_id=course.pk
        ).count()

    return {
        "id": course.pk,
        "title": str(
            field_value(course, ("title", "name", "course_name"),
                        f"Course {course.pk}")
        ),
        "name": str(
            field_value(course, ("title", "name", "course_name"),
                        f"Course {course.pk}")
        ),
        "description": str(
            field_value(course, ("description", "overview"), "") or ""
        ),
        "status": str(getattr(course, "status", "") or ""),
        "student_count": student_count,
        "enrolled_students": student_count,
        "module_count": module_count,
    }


def get_upcoming_classes(user, course_ids):
    LiveClass = get_model("LiveClass", "learning")

    if LiveClass is None:
        return []

    fields = model_fields(LiveClass)

    if not {"mentor", "scheduled_at"}.issubset(fields):
        return []

    try:
        queryset = LiveClass.objects.filter(
            mentor=user,
            scheduled_at__gte=timezone.now(),
        )

        if "status" in fields:
            queryset = queryset.filter(status="scheduled")

        if "course_name" in fields and course_ids:
            Course = get_model("Course", "courses")
            if Course is not None:
                course_names = Course.objects.filter(
                    pk__in=course_ids
                ).values_list("title", flat=True)

                queryset = queryset.filter(
                    course_name__in=course_names
                )

        result = []

        for item in queryset.order_by("scheduled_at")[:10]:
            result.append({
                "id": item.pk,
                "title": str(
                    field_value(item, ("title", "name"), "Live Class")
                ),
                "name": str(
                    field_value(item, ("title", "name"), "Live Class")
                ),
                "course_name": str(
                    getattr(item, "course_name", "") or ""
                ),
                "start_time": item.scheduled_at.isoformat(),
                "scheduled_at": item.scheduled_at.isoformat(),
                "status": str(getattr(item, "status", "") or ""),
            })

        return result

    except Exception:
        return []


def get_pending_activities(user, course_ids):
    """
    Count assignment submissions awaiting review, where the existing
    AssignmentSubmission model exposes the expected relationship.
    """
    Submission = get_model("AssignmentSubmission", "learning")

    if Submission is None:
        return 0

    fields = model_fields(Submission)

    try:
        queryset = Submission.objects.all()

        # Restrict results to this mentor's assigned courses.
        if "assignment" in fields and course_ids:
            queryset = queryset.filter(
                assignment__course_id__in=course_ids
            )
        elif "assignment" in fields:
            return 0
        else:
            return 0

        if "status" in fields:
            queryset = queryset.filter(
                status__in=["submitted", "pending", "resubmitted"]
            )
        elif "is_graded" in fields:
            queryset = queryset.filter(is_graded=False)
        elif "reviewed_at" in fields:
            queryset = queryset.filter(reviewed_at__isnull=True)
        elif "marks_obtained" in fields:
            queryset = queryset.filter(marks_obtained__isnull=True)
        else:
            # Do not guess which submissions still need review.
            return 0

        return queryset.count()

    except Exception:
        return 0


class MentorDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def get(self, request):
        user = request.user

        courses, error = get_mentor_courses(user)

        if error:
            return Response(
                {"success": False, "message": error},
                status=500,
            )

        course_ids = list(courses.values_list("pk", flat=True))

        assignments = [
            serialize_course(course, user)
            for course in courses.order_by("pk")
        ]

        activities = MentorActivity.objects.filter(
            user=user
        )[:5]

        full_name = (
            user.get_full_name().strip()
            or getattr(user, "first_name", "")
            or getattr(user, "email", "")
            or "Mentor"
        )

        upcoming_classes = get_upcoming_classes(user, course_ids)

        students_count = get_course_students(course_ids, user)

        pending_count = get_pending_activities(user, course_ids)

        return Response({
            "success": True,
            "data": {
                "mentor": {
                    "id": user.pk,
                    "name": full_name,
                    "email": getattr(user, "email", ""),
                },
                "stats": {
                    "assigned_courses": len(assignments),
                    "students": students_count,
                    "upcoming_live_classes": len(upcoming_classes),
                    "pending_activities": pending_count,
                },
                "courses": assignments,
                "upcoming_classes": upcoming_classes,
                "recent_activities": MentorActivitySerializer(
                    activities, many=True
                ).data,
            },
        })


class MentorSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def get_object(self, request):
        preference, _ = MentorPreference.objects.get_or_create(
            user=request.user
        )
        return preference

    def get(self, request):
        serializer = MentorPreferenceSerializer(
            self.get_object(request)
        )
        return Response({
            "success": True,
            "data": serializer.data,
        })

    def patch(self, request):
        preference = self.get_object(request)

        serializer = MentorPreferenceSerializer(
            preference,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({
            "success": True,
            "message": "Settings updated successfully.",
            "data": serializer.data,
        })


class MentorActivitiesView(generics.ListAPIView):
    serializer_class = MentorActivitySerializer
    permission_classes = [IsAuthenticated, IsMentor]

    def get_queryset(self):
        return MentorActivity.objects.filter(
            user=self.request.user
        )[:50]
