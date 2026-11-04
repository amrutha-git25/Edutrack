
from django.apps import apps
from django.db.models import Q

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _is_mentor(user):
    """Allow access only to authenticated Mentor users."""
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="mentor").exists():
        return True

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)

    return str(role or "").strip().lower() == "mentor"


def _get_mentor_profile(user):
    MentorProfile = apps.get_model("users", "MentorProfile")

    return MentorProfile.objects.filter(user=user).first()


def _student_name(student):
    user = student.user
    return user.get_full_name().strip() or user.get_username()


def _serialize_student(student, assignments):
    """Serialize only student information needed by the Mentor screen."""
    user = student.user

    courses = []
    seen_course_ids = set()

    for assignment in assignments:
        course = assignment.course

        if course.pk in seen_course_ids:
            continue

        seen_course_ids.add(course.pk)
        courses.append({
            "id": course.pk,
            "title": course.title,
            "category": course.category,
        })

    return {
        "id": student.pk,
        "name": _student_name(student),
        "email": user.email,
        "pin_number": student.pin_number,
        "phone_number": student.phone_number,
        "branch": student.branch,
        "section": student.section,
        "percentage": str(student.percentage),
        "is_active": student.is_active,
        "joined_at": student.joined_at.isoformat()
        if student.joined_at else None,
        "courses": courses,
        "course_count": len(courses),
    }


class MentorStudentsView(APIView):
    """
    GET /api/mentor/students/

    Lists only students assigned to the logged-in mentor.
    Supports search, branch, section, and status filters.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_mentor(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Mentor access is required.",
                },
                status=403,
            )

        mentor_profile = _get_mentor_profile(request.user)

        if mentor_profile is None:
            return Response(
                {
                    "success": False,
                    "message": (
                        "No MentorProfile is linked to this account. "
                        "Link the account to an existing mentor profile."
                    ),
                },
                status=400,
            )

        MentorAssignment = apps.get_model(
            "courses", "MentorAssignment"
        )

        assignments = MentorAssignment.objects.filter(
            mentor=mentor_profile
        ).select_related(
            "student__user",
            "course",
        )

        search = request.query_params.get("search", "").strip()
        branch = request.query_params.get("branch", "").strip()
        section = request.query_params.get("section", "").strip()
        status_filter = request.query_params.get("status", "").strip().lower()
        course_id = request.query_params.get("course", "").strip()

        if search:
            assignments = assignments.filter(
                Q(student__user__first_name__icontains=search)
                | Q(student__user__last_name__icontains=search)
                | Q(student__user__username__icontains=search)
                | Q(student__user__email__icontains=search)
                | Q(student__pin_number__icontains=search)
            )

        if branch:
            assignments = assignments.filter(
                student__branch__iexact=branch
            )

        if section:
            assignments = assignments.filter(
                student__section__iexact=section
            )

        if status_filter in ("active", "inactive"):
            assignments = assignments.filter(
                student__is_active=(status_filter == "active")
            )

        if course_id:
            if not course_id.isdigit():
                return Response(
                    {
                        "success": False,
                        "message": "Course filter must be a valid ID.",
                    },
                    status=400,
                )

            assignments = assignments.filter(course_id=int(course_id))

        assignments = list(
            assignments.order_by(
                "student__user__first_name",
                "student__user__last_name",
            )
        )

        # Group assignments by student so a student assigned to multiple
        # courses appears only once in the list.
        grouped = {}

        for assignment in assignments:
            student = assignment.student
            grouped.setdefault(student.pk, {
                "student": student,
                "assignments": [],
            })
            grouped[student.pk]["assignments"].append(assignment)

        students = [
            _serialize_student(item["student"], item["assignments"])
            for item in grouped.values()
        ]

        students.sort(key=lambda item: item["name"].lower())

        branches = sorted({
            item["branch"]
            for item in students
            if item["branch"]
        })

        sections = sorted({
            item["section"]
            for item in students
            if item["section"]
        })

        courses_by_id = {}

        for item in students:
            for course in item["courses"]:
                courses_by_id[course["id"]] = course

        active_count = sum(
            1 for item in students if item["is_active"]
        )

        return Response({
            "success": True,
            "summary": {
                "total_students": len(students),
                "active_students": active_count,
                "inactive_students": len(students) - active_count,
                "total_courses": len(courses_by_id),
            },
            "filters": {
                "branches": branches,
                "sections": sections,
                "courses": sorted(
                    courses_by_id.values(),
                    key=lambda item: item["title"].lower(),
                ),
            },
            "students": students,
        })


class MentorStudentDetailView(APIView):
    """
    GET /api/mentor/students/<student_id>/

    Returns details only when the student is assigned to this mentor.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        if not _is_mentor(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Mentor access is required.",
                },
                status=403,
            )

        mentor_profile = _get_mentor_profile(request.user)

        if mentor_profile is None:
            return Response(
                {
                    "success": False,
                    "message": "No MentorProfile is linked to this account.",
                },
                status=400,
            )

        MentorAssignment = apps.get_model(
            "courses", "MentorAssignment"
        )

        assignments = list(
            MentorAssignment.objects.filter(
                mentor=mentor_profile,
                student_id=student_id,
            ).select_related(
                "student__user",
                "course",
            )
        )

        if not assignments:
            return Response(
                {
                    "success": False,
                    "message": (
                        "This student is not assigned to your mentor account."
                    ),
                },
                status=404,
            )

        student = assignments[0].student

        return Response({
            "success": True,
            "student": _serialize_student(student, assignments),
        })
