from datetime import timedelta
from django.apps import apps
from django.db.models import Sum
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StudySession
from .permissions import IsStudentUser
from .serializers import StudySessionSerializer

from django.db.models.functions import TruncDate

from .models import StudySession, StudentLearningActivity
from .progress_service import refresh_student_progress

def _model(app_label, model_name):
    try:
        return apps.get_model(app_label, model_name)
    except (LookupError, ValueError):
        return None


def _field_names(model):
    return {field.name for field in model._meta.get_fields()}


def _first_field(model, candidates):
    names = _field_names(model)
    return next((name for name in candidates if name in names), None)


def _related_value(obj, relation_name):
    try:
        return getattr(obj, relation_name, None)
    except Exception:
        return None


def _as_text(obj, candidates, default=""):
    for name in candidates:
        value = _related_value(obj, name)
        if value not in (None, ""):
            return str(value)
    return default


def _student_profile(user):
    for name in ("student_profile", "studentprofile", "profile"):
        value = _related_value(user, name)
        if value is not None:
            return value
    return None


def _student_relation_filter(model, user):
    """Return a safe filter for common Enrollment.student FK designs."""
    names = _field_names(model)
    profile = _student_profile(user)
    for field_name in ("student", "student_profile", "learner"):
        if field_name not in names:
            continue
        field = model._meta.get_field(field_name)
        related_model = getattr(field, "related_model", None)
        if related_model is None:
            continue
        if related_model == user.__class__:
            return {field_name: user}
        if profile is not None and related_model == profile.__class__:
            return {field_name: profile}
        # If the related model has a user FK, filter through it.
        related_names = _field_names(related_model)
        for user_field in ("user", "account"):
            if user_field in related_names:
                return {f"{field_name}__{user_field}": user}
    return None


def _course_payload(course, enrollment=None):
    title = _as_text(course, ("title", "name", "course_name"), "Untitled course")
    description = _as_text(course, ("description", "short_description"))
    progress = 0
    status_value = "Active"
    if enrollment is not None:
        try:
            progress = float(
                _related_value(enrollment, "progress_percentage")
                or _related_value(enrollment, "progress")
                or 0
            )
        except (TypeError, ValueError):
            progress = 0
        status_value = _as_text(enrollment, ("status",), "Active")
    total_lessons = 0
    for candidate in ("total_lessons", "lesson_count", "topic_count"):
        value = _related_value(course, candidate)
        if value is not None:
            try:
                total_lessons = int(value)
                break
            except (TypeError, ValueError):
                pass
    return {
        "id": getattr(course, "pk", None),
        "title": title,
        "description": description,
        "progress": max(0, min(100, round(progress))),
        "status": status_value,
        "total_lessons": total_lessons,
    }


def _get_student_courses(user):
    Enrollment = _model("courses", "Enrollment")
    if Enrollment is None:
        return []
    student_filter = _student_relation_filter(Enrollment, user)
    course_field = _first_field(Enrollment, ("course",))
    if not student_filter or not course_field:
        return []
    try:
        enrollments = Enrollment.objects.filter(**student_filter).select_related(course_field)
        payload = []
        for enrollment in enrollments:
            course = _related_value(enrollment, course_field)
            if course is None:
                continue
            course_data = _course_payload(course, enrollment)
            # Exclude cancelled/archived enrollments from the student's active course cards.
            status_value = course_data["status"].lower()
            if status_value in {"cancelled", "inactive", "archived"}:
                continue
            payload.append(course_data)
        return payload
    except Exception:
        # Keep the dashboard usable if this project's enrollment schema differs.
        return []


def _get_upcoming_tasks(user):
    Assignment = _model("learning", "Assignment")
    if Assignment is None:
        Assignment = _model("assignments", "Assignment")
    if Assignment is None:
        return []

    names = _field_names(Assignment)
    due_field = _first_field(Assignment, ("due_date", "deadline", "due_at"))
    title_field = _first_field(Assignment, ("title", "name", "assignment_title"))
    course_field = _first_field(Assignment, ("course",))
    if not title_field:
        return []

    # Only assignments belonging to the student's enrolled courses are included when possible.
    enrolled_ids = {item["id"] for item in _get_student_courses(user) if item.get("id") is not None}
    query = Assignment.objects.all()
    if course_field and enrolled_ids:
        query = query.filter(**{f"{course_field}_id__in": enrolled_ids})
    elif course_field:
        # No enrolled courses: avoid showing every assignment across the platform.
        return []

    if due_field:
        query = query.filter(**{f"{due_field}__gte": timezone.now() - timedelta(days=1)}).order_by(due_field)
    else:
        query = query.order_by("-pk")

    tasks = []
    for assignment in query[:8]:
        course = _related_value(assignment, course_field) if course_field else None
        due = _related_value(assignment, due_field) if due_field else None
        tasks.append({
            "id": assignment.pk,
            "title": str(_related_value(assignment, title_field) or "Assignment"),
            "course": _as_text(course, ("title", "name", "course_name"), "Course"),
            "due_date": due.isoformat() if due else None,
            "status": _as_text(assignment, ("status",), "Pending"),
        })
    return tasks


class StudentDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        start_date = today - timedelta(days=364)

        # Get the Student profile.
        Student = _model("users", "Student")

        if Student is None:
            return Response({
                "success": False,
                "message": "Student model could not be found.",
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            student = Student.objects.get(user=user)
        except Student.DoesNotExist:
            return Response({
                "success": False,
                "message": "No Student profile is linked to this account.",
            }, status=status.HTTP_404_NOT_FOUND)

        # Recalculate all enrolled course progress.
        progress_data = refresh_student_progress(student)

        # Get the student's learning activity.
        activities = StudentLearningActivity.objects.filter(
            student=user,
            last_activity_at__date__gte=start_date,
            last_activity_at__date__lte=today,
        )

        # Get manually recorded study sessions.
        # Automatically tracked activity is calculated separately.
        sessions = StudySession.objects.filter(
            student=user,
            source="manual",
            started_at__date__gte=start_date,
            started_at__date__lte=today,
        )

        daily_rows = {}

        # Aggregate learning activity by day.
        activity_rows = (
            activities
            .annotate(day=TruncDate("last_activity_at"))
            .values("day")
            .annotate(total_seconds=Sum("duration_seconds"))
        )

        for row in activity_rows:
            day = row["day"]

            if day:
                date_key = day.isoformat()
                daily_rows[date_key] = (
                    daily_rows.get(date_key, 0)
                    + (row["total_seconds"] or 0) / 3600
                )

        # Aggregate manually recorded sessions.
        session_rows = (
            sessions
            .annotate(day=TruncDate("started_at"))
            .values("day")
            .annotate(total_minutes=Sum("duration_minutes"))
        )

        for row in session_rows:
            day = row["day"]

            if day:
                date_key = day.isoformat()
                daily_rows[date_key] = (
                    daily_rows.get(date_key, 0)
                    + (row["total_minutes"] or 0) / 60
                )

        # Get enrolled course cards.
        courses = _get_student_courses(user)

        # Replace potentially outdated enrollment progress.
        progress_map = {
            item["course_id"]: item["progress"]
            for item in progress_data["courses"]
        }

        for course in courses:
            course["progress"] = round(
                progress_map.get(course["id"], 0)
            )

        tasks = _get_upcoming_tasks(user)

        # Calculate study time.
        total_activity_seconds = (
            activities.aggregate(
                total=Sum("duration_seconds")
            )["total"] or 0
        )

        total_manual_minutes = (
            sessions.aggregate(
                total=Sum("duration_minutes")
            )["total"] or 0
        )

        total_study_hours = (
            total_activity_seconds / 3600
            + total_manual_minutes / 60
        )

        # Heatmap active days.
        active_days = sum(
            1 for hours in daily_rows.values()
            if hours > 0
        )

        # Current learning streak.
        streak = 0
        cursor = today

        while daily_rows.get(cursor.isoformat(), 0) > 0:
            streak += 1
            cursor -= timedelta(days=1)

        first_name = (
            getattr(user, "first_name", "")
            or getattr(user, "username", "")
            or "Student"
        )

        completed_lessons = sum(
            1
            for activity in activities
            if activity.is_completed
        )

        return Response({
            "success": True,
            "data": {
                "student": {
                    "id": user.pk,
                    "name": first_name,
                    "email": getattr(user, "email", ""),
                },

                "summary": {
                    "enrolled_courses": progress_data["total_courses"],
                    "completed_lessons": completed_lessons,
                    "overall_progress": progress_data["overall_progress"],
                    "pending_tasks": len(tasks),
                    "study_hours": round(total_study_hours, 2),
                    "active_days": active_days,
                    "current_streak": streak,
                },

                "courses": courses,

                "tasks": tasks,

                "study_activity": [
                    {
                        "date": (
                            start_date + timedelta(days=offset)
                        ).isoformat(),
                        "hours": round(
                            daily_rows.get(
                                (
                                    start_date
                                    + timedelta(days=offset)
                                ).isoformat(),
                                0,
                            ),
                            2,
                        ),
                    }
                    for offset in range(365)
                ],
            },
        })


class StudySessionListCreateView(generics.ListCreateAPIView):
    serializer_class = StudySessionSerializer
    permission_classes = [IsAuthenticated, IsStudentUser]

    def get_queryset(self):
        return StudySession.objects.filter(student=self.request.user)

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            {"success": True, "message": "Study session recorded.", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )
