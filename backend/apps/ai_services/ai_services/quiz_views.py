"""Student quiz APIs for EduTrack. Kept separate from student_exam_views.py."""

from datetime import timedelta
from .models import Exam, ExamAttempt
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ExamAnswer
from .models import Question


from apps.users.users.models import Student
from apps.courses.courses.models import Course, Enrollment
from apps.student_dashboard.models import StudentLearningActivity

def is_student(user):
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)
    return str(role or "").strip().lower() == "student"


def student_denied():
    return Response(
        {"success": False, "message": "Student access is required."},
        status=status.HTTP_403_FORBIDDEN,
    )


def exam_question_payload(question):
    # Deliberately exclude correct_option and explanation while the exam is active.
    return {
        "id": question.id,
        "text": question.text,
        "option_a": question.option_a,
        "option_b": question.option_b,
        "option_c": question.option_c,
        "option_d": question.option_d,
        "marks": question.marks,
        "topic": question.topic,
        "difficulty": question.difficulty,
    }


def attempt_deadline(attempt):
    return attempt.started_at + timedelta(minutes=attempt.exam.duration_minutes)


def result_payload(attempt):
    answer_map = {
        answer.question_id: answer
        for answer in attempt.answers.select_related("question").all()
    }
    review = []
    for question in attempt.exam.questions.all():
        answer = answer_map.get(question.id)
        review.append({
            "question_id": question.id,
            "question": question.text,
            "options": {
                "A": question.option_a,
                "B": question.option_b,
                "C": question.option_c,
                "D": question.option_d,
            },
            "selected_option": answer.selected_option if answer else "",
            "correct_option": question.correct_option,
            "is_correct": bool(answer and answer.is_correct),
            "marks": question.marks,
            "marks_awarded": answer.awarded_marks if answer else 0,
            "explanation": question.explanation,
        })

    total_marks = sum(q.marks for q in attempt.exam.questions.all())
    percentage = round((attempt.score / total_marks) * 100, 2) if total_marks else 0
    return {
        "success": True,
        "attempt_id": attempt.id,
        "exam_id": attempt.exam_id,
        "exam_title": attempt.exam.title,
        "course_name": attempt.exam.course_name,
        "status": attempt.status,
        "score": attempt.score,
        "total_marks": total_marks,
        "passing_marks": attempt.exam.passing_marks,
        "percentage": percentage,
        "passed": attempt.score >= attempt.exam.passing_marks,
        "started_at": attempt.started_at,
        "submitted_at": attempt.submitted_at,
        "questions": review,
    }
def record_quiz_learning_activity(attempt):
    """
    Create or update learning activity after a quiz submission.
    Maps Exam.course_name to the enrolled Course title.
    """

    try:
        student_profile = Student.objects.get(
            user=attempt.student
        )
    except Student.DoesNotExist:
        return

    course_name = str(
        attempt.exam.course_name or ""
    ).strip()

    if not course_name:
        return

    # Match the exam's course name to an enrolled course.
    enrollment = (
        Enrollment.objects
        .select_related("course")
        .filter(
            student=student_profile,
            status__in=["active", "completed"],
            course__title__iexact=course_name,
        )
        .first()
    )

    if not enrollment:
        # Do not break quiz submission if a course cannot be matched.
        return

    now = timezone.now()

    duration_seconds = 0

    if attempt.started_at and attempt.submitted_at:
        duration_seconds = max(
            0,
            int(
                (attempt.submitted_at - attempt.started_at).total_seconds()
            ),
        )

    StudentLearningActivity.objects.update_or_create(
        student=attempt.student,
        course=enrollment.course,
        exam_attempt=attempt,
        activity_type="quiz",
        defaults={
            "duration_seconds": duration_seconds,
            "last_position_seconds": 0,
            "media_duration_seconds": 0,
            "progress_percentage": 100,
            "is_completed": True,
            "last_activity_at": now,
            "completed_at": now,
        },
    )

class StudentExamListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_student(request.user):
            return student_denied()

        exams = Exam.objects.filter(status="published").order_by("-created_at")
        results = []
        for exam in exams:
            # Always expose the newest attempt in the quiz list. This ensures
            # the score and View result action point to the reattempt result.
            attempt = ExamAttempt.objects.filter(
                exam=exam, student=request.user
            ).order_by("-started_at", "-id").first()
            results.append({
                "id": exam.id,
                "title": exam.title,
                "description": exam.description,
                "course_name": exam.course_name,
                "duration_minutes": exam.duration_minutes,
                "question_count": exam.questions.count(),
                "total_marks": sum(q.marks for q in exam.questions.all()),
                "passing_marks": exam.passing_marks,
                "created_at": exam.created_at,
                "attempt_status": attempt.status if attempt else None,
                "attempt_id": attempt.id if attempt else None,
                "score": attempt.score if attempt and attempt.status == "submitted" else None,
            })

        return Response({
            "success": True,
            "count": len(results),
            "results": results,
        })


class StudentExamDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, exam_id):
        if not is_student(request.user):
            return student_denied()

        exam = get_object_or_404(Exam, pk=exam_id, status="published")
        existing = ExamAttempt.objects.filter(
            exam=exam, student=request.user
        ).order_by("-started_at", "-id").first()

        return Response({
            "success": True,
            "id": exam.id,
            "title": exam.title,
            "description": exam.description,
            "course_name": exam.course_name,
            "duration_minutes": exam.duration_minutes,
            "total_marks": sum(q.marks for q in exam.questions.all()),
            "passing_marks": exam.passing_marks,
            "question_count": exam.questions.count(),
            "questions": [
                exam_question_payload(q)
                for q in exam.questions.all()
            ],
        })


class StartStudentExamAttemptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, exam_id):
        if not is_student(request.user):
            return student_denied()

        exam = get_object_or_404(Exam, pk=exam_id, status="published")
        if not exam.questions.exists():
            return Response(
                {"success": False, "message": "This exam has no questions yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = ExamAttempt.objects.filter(
            exam=exam, student=request.user
        ).order_by("-started_at", "-id").first()
        if existing and existing.status == "in_progress":
            remaining = max(
                0, int((attempt_deadline(existing) - timezone.now()).total_seconds())
            )
            if remaining > 0:
                return Response({
                    "success": True,
                    "message": "Existing attempt resumed.",
                    "attempt_id": existing.id,
                    "started_at": existing.started_at,
                    "duration_minutes": exam.duration_minutes,
                    "remaining_seconds": remaining,
                })
            existing.status = "expired"
            existing.submitted_at = timezone.now()
            existing.save(update_fields=["status", "submitted_at"])

        try:
            with transaction.atomic():
                attempt = ExamAttempt.objects.create(
                    exam=exam,
                    student=request.user,
                )
        except IntegrityError:
            # Handles two simultaneous start requests for the same student/exam.
            attempt = ExamAttempt.objects.filter(
                exam=exam, student=request.user
            ).order_by("-started_at", "-id").first()
            if attempt is None or attempt.status != "in_progress":
                return Response({
                    "success": False,
                    "message": "Unable to create a new quiz attempt. Please try again.",
                }, status=status.HTTP_409_CONFLICT)

        remaining = max(
            0, int((attempt_deadline(attempt) - timezone.now()).total_seconds())
        )
        return Response({
            "success": True,
            "message": "Exam attempt started.",
            "attempt_id": attempt.id,
            "started_at": attempt.started_at,
            "duration_minutes": exam.duration_minutes,
            "remaining_seconds": remaining,
        }, status=status.HTTP_201_CREATED)


class SubmitStudentExamAttemptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, attempt_id):
        if not is_student(request.user):
            return student_denied()

        attempt = get_object_or_404(
            ExamAttempt.objects.select_related("exam"),
            pk=attempt_id,
            student=request.user,
        )

        if attempt.status == "submitted":
            return Response({
                "success": False,
                "message": "This attempt has already been submitted.",
                "result": result_payload(attempt),
            }, status=status.HTTP_409_CONFLICT)

        answers = request.data.get("answers", [])
        if not isinstance(answers, list):
            return Response(
                {"success": False, "message": "'answers' must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        submitted_by_question = {}
        for item in answers:
            if not isinstance(item, dict):
                return Response(
                    {"success": False, "message": "Each answer must be an object."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                question_id = int(item.get("question_id"))
            except (TypeError, ValueError):
                return Response(
                    {"success": False, "message": "Each answer needs a valid question_id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected = str(item.get("selected_option", "")).upper().strip()
            if selected not in ("", "A", "B", "C", "D"):
                return Response(
                    {"success": False, "message": "selected_option must be A, B, C, D, or empty."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            submitted_by_question[question_id] = selected

        questions = list(attempt.exam.questions.all())
        allowed_ids = {q.id for q in questions}
        if any(qid not in allowed_ids for qid in submitted_by_question):
            return Response(
                {"success": False, "message": "An answer references a question outside this exam."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Server-side deadline enforcement: if submitted after time expires,
        # unanswered answers are recorded and no late selections earn marks.
        expired = timezone.now() >= attempt_deadline(attempt)
        score = 0

        with transaction.atomic():
            for question in questions:
                selected = "" if expired else submitted_by_question.get(question.id, "")
                correct = bool(selected and selected == question.correct_option)
                marks_awarded = question.marks if correct else 0
                score += marks_awarded
                ExamAnswer.objects.update_or_create(
                    attempt=attempt,
                    question=question,
                    defaults={
                        "selected_option": selected,
                        "is_correct": correct,
                        "awarded_marks": marks_awarded,
                    },
                )

            attempt.score = score
            attempt.status = "submitted"
            attempt.submitted_at = timezone.now()
            attempt.save(update_fields=["score", "status", "submitted_at"])
            record_quiz_learning_activity(attempt)
        return Response({
            "success": True,
            "message": "Time expired; the exam was submitted." if expired else "Exam submitted successfully.",
            "result": result_payload(attempt),
        })


class StudentExamResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        if not is_student(request.user):
            return student_denied()

        requested_attempt = get_object_or_404(
            ExamAttempt.objects.select_related("exam"),
            pk=attempt_id,
            student=request.user,
        )
        # Resolve to the student's latest attempt for this exam. This prevents
        # an old result URL/card from displaying a previous attempt's score.
        attempt = ExamAttempt.objects.select_related("exam").filter(
            exam_id=requested_attempt.exam_id,
            student=request.user,
        ).order_by("-started_at", "-id").first()
        if attempt is None or attempt.status != "submitted":
            return Response(
                {"success": False, "message": "The exam has not been submitted yet."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(result_payload(attempt))
