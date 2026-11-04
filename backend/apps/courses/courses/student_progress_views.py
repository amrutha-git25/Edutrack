from decimal import Decimal, ROUND_HALF_UP

from django.apps import apps
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.student_dashboard.progress_service import (
    refresh_student_progress,
)


def is_student(user):
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)

    return str(role or "").strip().lower() == "student"


def calculate_materials_progress(course_progress):
    """
    Calculate Learning Materials progress using documents only.
    Videos and quizzes are completely excluded.
    """

    total_documents = course_progress.get("total_documents", 0)
    completed_documents = course_progress.get(
        "completed_documents", 0
    )

    if total_documents <= 0:
        return 0.0

    percentage = (
        Decimal(completed_documents)
        * Decimal("100")
        / Decimal(total_documents)
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    return float(min(Decimal("100.00"), percentage))


class StudentProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_student(request.user):
            return Response({
                "success": False,
                "message": "Student access is required.",
            }, status=403)

        Student = apps.get_model("users", "Student")
        Enrollment = apps.get_model("courses", "Enrollment")

        try:
            student = Student.objects.get(user=request.user)
        except Student.DoesNotExist:
            return Response({
                "success": False,
                "message": "No Student profile is linked to this account.",
            }, status=404)

        # Refresh and save the overall course progress.
        progress_data = refresh_student_progress(student)

        enrollments = (
            Enrollment.objects
            .filter(student=student)
            .exclude(status__iexact="cancelled")
            .select_related("course")
            .order_by("-enrolled_at")
        )

        courses = []

        for enrollment in enrollments:

            course_progress = next(
                (
                    item
                    for item in progress_data["courses"]
                    if item["course_id"] == enrollment.course_id
                ),
                None,
            )

            # Overall progress includes videos, documents and quizzes.
            overall_course_progress = (
                course_progress["progress"]
                if course_progress
                else float(enrollment.progress or 0)
            )

            # Learning Materials progress includes documents only.
            materials_progress = (
                calculate_materials_progress(course_progress)
                if course_progress
                else 0.0
            )

            courses.append({
                "id": enrollment.course_id,
                "title": enrollment.course.title,
                "category": enrollment.course.category,

                "enrolled_at": (
                    enrollment.enrolled_at.isoformat()
                    if enrollment.enrolled_at
                    else None
                ),

                "status": enrollment.status,

                # Overall course progress.
                "progress": overall_course_progress,

                # Document-only Learning Materials progress.
                "materials_progress": materials_progress,

                "total_activities": (
                    course_progress["total_activities"]
                    if course_progress else 0
                ),

                "completed_activities": (
                    course_progress["completed_activities"]
                    if course_progress else 0
                ),

                "total_videos": (
                    course_progress["total_videos"]
                    if course_progress else 0
                ),

                "completed_videos": (
                    course_progress["completed_videos"]
                    if course_progress else 0
                ),

                "total_documents": (
                    course_progress["total_documents"]
                    if course_progress else 0
                ),

                "completed_documents": (
                    course_progress["completed_documents"]
                    if course_progress else 0
                ),

                "total_quizzes": (
                    course_progress["total_quizzes"]
                    if course_progress else 0
                ),

                "completed_quizzes": (
                    course_progress["completed_quizzes"]
                    if course_progress else 0
                ),
            })

        return Response({
            "success": True,
            "data": {
                "overview": {
                    "total_courses": progress_data["total_courses"],
                    "active_courses": progress_data["active_courses"],
                    "completed_courses": progress_data["completed_courses"],
                    "overall_progress": progress_data["overall_progress"],
                },
                "courses": courses,
            },
        })