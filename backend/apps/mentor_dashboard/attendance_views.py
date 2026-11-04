
# backend/apps/mentor_dashboard/attendance_views.py

from django.apps import apps
from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _model(app_label, model_name):
    try:
        return apps.get_model(app_label, model_name)
    except (LookupError, ValueError):
        return None


def _is_mentor(user):
    if not user or not user.is_authenticated:
        return False

    try:
        if user.groups.filter(name__iexact="MENTOR").exists():
            return True
    except (AttributeError, TypeError):
        pass

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)
    return str(role or "").strip().lower() == "mentor"


def _mentor_denied(request):
    if not _is_mentor(request.user):
        return Response(
            {
                "success": False,
                "message": "Mentor access is required.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _display_name(user):
    name = user.get_full_name().strip()
    return name or getattr(user, "email", "") or str(user.pk)


def _student_user_ids_for_course(course):
    """
    Resolve the login-user IDs of students assigned to this course.
    MentorAssignment.student points to users.Student, which is linked
    to the student's login account through its user relationship.
    """
    Assignment = _model("courses", "MentorAssignment")
    if Assignment is None:
        return set()

    assignments = Assignment.objects.filter(course=course).select_related(
        "student"
    )

    user_ids = set()
    for assignment in assignments:
        student_profile = getattr(assignment, "student", None)
        student_user = getattr(student_profile, "user", None)

        if student_user is not None:
            user_ids.add(student_user.pk)

    return user_ids


def _assigned_courses_for_mentor(user):
    Course = _model("courses", "Course")
    Assignment = _model("courses", "MentorAssignment")

    if Course is None or Assignment is None:
        return Course.objects.none() if Course else []

    course_ids = Assignment.objects.filter(
        mentor__user=user
    ).values_list("course_id", flat=True).distinct()

    # Some installations also assign the mentor directly on Course.
    direct_course_ids = []
    course_field_names = {
        field.name for field in Course._meta.get_fields()
    }
    if "mentor" in course_field_names:
        direct_course_ids = Course.objects.filter(
            mentor=user
        ).values_list("id", flat=True)

    return Course.objects.filter(
        pk__in=list(course_ids) + list(direct_course_ids)
    ).distinct()


def _class_for_mentor(user, class_id):
    LiveClass = _model("learning", "LiveClass")
    if LiveClass is None:
        return None

    try:
        live_class = LiveClass.objects.get(
            pk=class_id,
            mentor=user,
        )
    except LiveClass.DoesNotExist:
        return None

    assigned_courses = _assigned_courses_for_mentor(user)
    if not hasattr(assigned_courses, "filter"):
        return None

    allowed_names = {
        str(getattr(course, "title", "")).strip().casefold()
        for course in assigned_courses
    }

    if live_class.course_name.strip().casefold() not in allowed_names:
        return None

    return live_class


def _serialize_attendance_record(record):
    student = record.student
    return {
        "id": record.pk,
        "student_id": student.pk,
        "student_name": _display_name(student),
        "student_email": getattr(student, "email", ""),
        "status": record.status,
        "joined_at": record.joined_at,
        "recorded_at": record.recorded_at,
    }


def _serialize_class(live_class):
    records = list(live_class.attendance_records.all())
    present = sum(record.status == "present" for record in records)
    absent = sum(record.status == "absent" for record in records)

    return {
        "id": live_class.pk,
        "title": live_class.title,
        "course_name": live_class.course_name,
        "scheduled_at": live_class.scheduled_at,
        "duration_minutes": live_class.duration_minutes,
        "status": live_class.status,
        "meeting_url": live_class.meeting_url,
        "total_marked": len(records),
        "present_count": present,
        "absent_count": absent,
    }


class MentorAttendanceListView(APIView):
    """
    GET /api/mentor/attendance/

    Lists the mentor's authorized live classes with attendance totals.
    Optional query parameters: ?status=live and ?search=python
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _mentor_denied(request)
        if denied:
            return denied

        LiveClass = _model("learning", "LiveClass")
        if LiveClass is None:
            return Response(
                {
                    "success": False,
                    "message": "The LiveClass model was not found.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        courses = _assigned_courses_for_mentor(request.user)
        course_names = [
            str(getattr(course, "title", "")).strip()
            for course in courses
        ]

        classes = LiveClass.objects.filter(
            mentor=request.user,
            course_name__in=course_names,
        ).prefetch_related("attendance_records")

        class_status = request.query_params.get("status", "").strip()
        search = request.query_params.get("search", "").strip()

        if class_status:
            classes = classes.filter(status=class_status)

        if search:
            from django.db.models import Q
            classes = classes.filter(
                Q(title__icontains=search)
                | Q(course_name__icontains=search)
            )

        results = [_serialize_class(item) for item in classes]

        total_present = sum(item["present_count"] for item in results)
        total_absent = sum(item["absent_count"] for item in results)
        total_marked = total_present + total_absent

        return Response({
            "success": True,
            "summary": {
                "classes": len(results),
                "present": total_present,
                "absent": total_absent,
                "attendance_percentage": round(
                    total_present * 100 / total_marked, 2
                ) if total_marked else 0,
            },
            "results": results,
        })


class MentorClassAttendanceView(APIView):
    """
    GET  /api/mentor/attendance/<class_id>/
    POST /api/mentor/attendance/<class_id>/

    GET returns the assigned students and any attendance already saved.
    POST accepts a list of student IDs and present/absent statuses.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        live_class = _class_for_mentor(request.user, class_id)
        if live_class is None:
            return Response(
                {
                    "success": False,
                    "message": "Live class not found or not assigned to you.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        Attendance = _model("learning", "Attendance")
        if Attendance is None:
            return Response(
                {
                    "success": False,
                    "message": "The Attendance model was not found.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        courses = _assigned_courses_for_mentor(request.user)
        course = next(
            (
                item for item in courses
                if str(getattr(item, "title", "")).strip().casefold()
                == live_class.course_name.strip().casefold()
            ),
            None,
        )

        if course is None:
            return Response(
                {
                    "success": False,
                    "message": "The class course is not assigned to you.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_student_ids = _student_user_ids_for_course(course)
        saved_records = {
            record.student_id: record
            for record in Attendance.objects.filter(
                live_class=live_class,
                student_id__in=allowed_student_ids,
            ).select_related("student")
        }

        from django.contrib.auth import get_user_model
        User = get_user_model()
        students = User.objects.filter(
            pk__in=allowed_student_ids
        ).order_by("first_name", "last_name", "email")

        results = []
        for student in students:
            record = saved_records.get(student.pk)
            results.append({
                "student_id": student.pk,
                "student_name": _display_name(student),
                "student_email": getattr(student, "email", ""),
                "status": record.status if record else "",
                "joined_at": record.joined_at if record else None,
                "recorded_at": record.recorded_at if record else None,
            })

        return Response({
            "success": True,
            "class": {
                "id": live_class.pk,
                "title": live_class.title,
                "course_name": live_class.course_name,
                "scheduled_at": live_class.scheduled_at,
                "status": live_class.status,
            },
            "count": len(results),
            "results": results,
        })

    def post(self, request, class_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        live_class = _class_for_mentor(request.user, class_id)
        if live_class is None:
            return Response(
                {
                    "success": False,
                    "message": "Live class not found or not assigned to you.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        Attendance = _model("learning", "Attendance")
        if Attendance is None:
            return Response(
                {
                    "success": False,
                    "message": "The Attendance model was not found.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        courses = _assigned_courses_for_mentor(request.user)
        course = next(
            (
                item for item in courses
                if str(getattr(item, "title", "")).strip().casefold()
                == live_class.course_name.strip().casefold()
            ),
            None,
        )

        if course is None:
            return Response(
                {
                    "success": False,
                    "message": "The class course is not assigned to you.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_student_ids = _student_user_ids_for_course(course)
        records = request.data.get("records")

        if not isinstance(records, list) or not records:
            return Response(
                {
                    "success": False,
                    "message": "Send a non-empty records list.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        seen_ids = set()
        for item in records:
            if not isinstance(item, dict):
                return Response(
                    {
                        "success": False,
                        "message": "Each attendance record must be an object.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            student_id = item.get("student_id")
            attendance_status = str(item.get("status", "")).lower()

            try:
                student_id = int(student_id)
            except (TypeError, ValueError):
                return Response(
                    {
                        "success": False,
                        "message": "Each record needs a valid student_id.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if student_id in seen_ids:
                return Response(
                    {
                        "success": False,
                        "message": "Duplicate student IDs are not allowed.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            seen_ids.add(student_id)

            if student_id not in allowed_student_ids:
                return Response(
                    {
                        "success": False,
                        "message": (
                            f"Student {student_id} is not assigned "
                            "to this course."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if attendance_status not in {"present", "absent"}:
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Status must be either 'present' or 'absent'."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from django.contrib.auth import get_user_model
        User = get_user_model()
        student_users = {
            user.pk: user
            for user in User.objects.filter(pk__in=seen_ids)
        }

        with transaction.atomic():
            for item in records:
                student_id = int(item["student_id"])
                attendance_status = str(item["status"]).lower()
                joined_at = item.get("joined_at")

                defaults = {"status": attendance_status}

                if joined_at:
                    defaults["joined_at"] = joined_at
                elif attendance_status == "present":
                    defaults["joined_at"] = timezone.now()

                Attendance.objects.update_or_create(
                    live_class=live_class,
                    student=student_users[student_id],
                    defaults=defaults,
                )

        refreshed = Attendance.objects.filter(
            live_class=live_class,
            student_id__in=seen_ids,
        ).select_related("student")

        return Response(
            {
                "success": True,
                "message": "Attendance saved successfully.",
                "saved_count": refreshed.count(),
                "results": [
                    _serialize_attendance_record(record)
                    for record in refreshed
                ],
            },
            status=status.HTTP_200_OK,
        )
