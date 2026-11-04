from decimal import Decimal, ROUND_HALF_UP

from django.apps import apps
from django.db.models import Q


def calculate_course_progress(enrollment, save=True):
    """
    Calculate progress for one enrolled student in one course.

    Required activities:
      1. Published videos
      2. Published documents and presentations
      3. Published quizzes matching the course title

    Completed activities:
      1. Materials with completed StudentLearningActivity records
      2. Quizzes with at least one submitted ExamAttempt
    """

    Material = apps.get_model("courses", "Material")
    Exam = apps.get_model("ai_services", "Exam")
    ExamAttempt = apps.get_model("ai_services", "ExamAttempt")
    StudentLearningActivity = apps.get_model(
        "student_dashboard",
        "StudentLearningActivity",
    )

    student_user = enrollment.student.user
    course = enrollment.course

    # Only published learning materials count toward progress.
    materials = Material.objects.filter(
        topic__course=course,
        is_published=True,
    ).filter(
        Q(material_type__iexact="video")
        | Q(material_type__iexact="document")
        | Q(material_type__iexact="presentation")
    )

    total_materials = materials.count()

    # Count each completed material only once.
    completed_material_ids = set(
        StudentLearningActivity.objects.filter(
            student=student_user,
            course=course,
            material__in=materials,
            activity_type__in=["video", "document"],
            is_completed=True,
        ).values_list("material_id", flat=True).distinct()
    )

    completed_materials = len(completed_material_ids)

    # Exams currently use course_name rather than a Course foreign key.
    exams = Exam.objects.filter(
        status="published",
        course_name__iexact=course.title,
    )

    total_quizzes = exams.count()

    # A quiz counts once when the student has at least one submitted attempt.
    completed_quiz_ids = set(
        ExamAttempt.objects.filter(
            student=student_user,
            exam__in=exams,
            status="submitted",
        ).values_list("exam_id", flat=True).distinct()
    )

    completed_quizzes = len(completed_quiz_ids)

    # Overall course progress remains shared by the Student Dashboard and My Progress.
    total_activities = total_materials + total_quizzes
    completed_activities = completed_materials + completed_quizzes

    if total_activities:
        percentage = (
            Decimal(completed_activities)
            * Decimal("100")
            / Decimal(total_activities)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        percentage = Decimal("0.00")

    percentage = min(Decimal("100.00"), percentage)

    # Learning Materials progress is calculated independently from notes/documents.
    # Videos and quizzes are deliberately excluded from this percentage.
    document_materials = materials.filter(
        Q(material_type__iexact="document")
        | Q(material_type__iexact="presentation")
    )
    total_documents = document_materials.count()
    completed_document_ids = completed_material_ids.intersection(
        set(document_materials.values_list("id", flat=True))
    )
    completed_documents = len(completed_document_ids)

    if total_documents:
        materials_percentage = (
            Decimal(completed_documents)
            * Decimal("100")
            / Decimal(total_documents)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        materials_percentage = Decimal("0.00")

    materials_percentage = min(Decimal("100.00"), materials_percentage)

    if save:
        enrollment.progress = percentage
        enrollment.save(update_fields=["progress"])

    return {
        "course_id": course.id,
        "course_title": course.title,
        "total_activities": total_activities,
        "completed_activities": completed_activities,
        "total_videos": materials.filter(
            material_type__iexact="video"
        ).count(),
        "completed_videos": materials.filter(
            material_type__iexact="video",
            id__in=completed_material_ids,
        ).count(),
        "total_documents": total_documents,
        "completed_documents": completed_documents,
        "materials_progress": float(materials_percentage),
        "total_quizzes": total_quizzes,
        "completed_quizzes": completed_quizzes,
        "progress": float(percentage),
    }


def refresh_student_progress(student):
    """
    Recalculate and save progress for all non-cancelled enrollments
    belonging to a Student profile.
    """

    Enrollment = apps.get_model("courses", "Enrollment")

    enrollments = (
        Enrollment.objects
        .filter(
            student=student,
        )
        .exclude(status__iexact="cancelled")
        .select_related("student__user", "course")
    )

    results = []

    for enrollment in enrollments:
        results.append(
            calculate_course_progress(enrollment, save=True)
        )

    valid_progress = [
        item["progress"] for item in results
    ]

    overall_progress = (
        round(sum(valid_progress) / len(valid_progress), 2)
        if valid_progress
        else 0
    )

    return {
        "total_courses": len(results),
        "completed_courses": sum(
            1 for item in results if item["progress"] >= 100
        ),
        "active_courses": sum(
            1 for item in results if item["progress"] < 100
        ),
        "overall_progress": overall_progress,
        "courses": results,
    }