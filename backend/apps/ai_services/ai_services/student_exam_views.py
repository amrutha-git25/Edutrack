
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_services.ai_services.models import (
    Exam,
    Question,
    ExamAttempt,
    ExamAnswer,
)


User = get_user_model()


def is_student(user):
    """Allow only users registered with the Student role."""
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    role = getattr(user, "role", "")
    return str(role).upper() == "STUDENT"


def exam_deadline(attempt):
    return attempt.started_at + timedelta(
        minutes=attempt.exam.duration_minutes
    )


def exam_time_expired(attempt):
    return timezone.now() >= exam_deadline(attempt)


def expire_attempt_if_needed(attempt):
    if (
        attempt.status == "in_progress"
        and exam_time_expired(attempt)
    ):
        attempt.status = "expired"
        attempt.submitted_at = timezone.now()
        attempt.save(update_fields=["status", "submitted_at"])
        return True

    return attempt.status == "expired"


def question_data(question):
    """Return question options without exposing the correct answer."""
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


def attempt_data(attempt):
    return {
        "id": attempt.id,
        "exam_id": attempt.exam_id,
        "exam_title": attempt.exam.title,
        "status": attempt.status,
        "started_at": attempt.started_at,
        "deadline": exam_deadline(attempt),
        "submitted_at": attempt.submitted_at,
        "score": attempt.score,
    }


class StudentOnlyAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)

        if not is_student(request.user):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Only Student accounts can access assessments."
            )


class StudentExamListView(StudentOnlyAPIView):
    """List published exams available to students."""

    def get(self, request):
        exams = (
            Exam.objects.filter(status="published")
            .order_by("-created_at")
        )

        results = []

        for exam in exams:
            attempt = ExamAttempt.objects.filter(
                exam=exam,
                student=request.user,
            ).first()

            if attempt:
                expire_attempt_if_needed(attempt)

            results.append({
                "id": exam.id,
                "title": exam.title,
                "description": exam.description,
                "course_name": exam.course_name,
                "duration_minutes": exam.duration_minutes,
                "total_marks": exam.total_marks,
                "passing_marks": exam.passing_marks,
                "question_count": exam.questions.count(),
                "status": exam.status,
                "attempt": (
                    attempt_data(attempt) if attempt else None
                ),
                "can_start": (
                    attempt is None
                    and exam.questions.exists()
                ),
            })

        return Response({
            "success": True,
            "count": len(results),
            "results": results,
        })


class StudentExamDetailView(StudentOnlyAPIView):
    """Get published exam details without correct answers."""

    def get(self, request, exam_id):
        exam = Exam.objects.filter(
            id=exam_id,
            status="published",
        ).first()

        if exam is None:
            return Response(
                {
                    "success": False,
                    "message": "Published exam not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        attempt = ExamAttempt.objects.filter(
            exam=exam,
            student=request.user,
        ).first()

        if attempt:
            expire_attempt_if_needed(attempt)

        return Response({
            "success": True,
            "exam": {
                "id": exam.id,
                "title": exam.title,
                "description": exam.description,
                "course_name": exam.course_name,
                "duration_minutes": exam.duration_minutes,
                "total_marks": exam.total_marks,
                "passing_marks": exam.passing_marks,
                "question_count": exam.questions.count(),
            },
            "attempt": (
                attempt_data(attempt) if attempt else None
            ),
            "questions": [
                question_data(question)
                for question in exam.questions.all()
            ],
        })


class StartExamAttemptView(StudentOnlyAPIView):
    """Start an exam once per student."""

    def post(self, request, exam_id):
        exam = Exam.objects.filter(
            id=exam_id,
            status="published",
        ).first()

        if exam is None:
            return Response(
                {
                    "success": False,
                    "message": "Published exam not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not exam.questions.exists():
            return Response(
                {
                    "success": False,
                    "message": "This exam has no questions.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = ExamAttempt.objects.filter(
            exam=exam,
            student=request.user,
        ).first()

        if existing:
            expire_attempt_if_needed(existing)

            if existing.status == "in_progress":
                return Response({
                    "success": True,
                    "message": "Resuming your existing attempt.",
                    "attempt": attempt_data(existing),
                })

            return Response(
                {
                    "success": False,
                    "message": (
                        "You have already attempted this exam. "
                        "A second attempt is not allowed."
                    ),
                    "attempt": attempt_data(existing),
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            with transaction.atomic():
                attempt = ExamAttempt.objects.create(
                    exam=exam,
                    student=request.user,
                )
        except IntegrityError:
            attempt = ExamAttempt.objects.filter(
                exam=exam,
                student=request.user,
            ).first()

            if attempt is None:
                return Response(
                    {
                        "success": False,
                        "message": "Unable to start the exam.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            expire_attempt_if_needed(attempt)

            if attempt.status != "in_progress":
                return Response(
                    {
                        "success": False,
                        "message": "This exam attempt is already closed.",
                        "attempt": attempt_data(attempt),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        return Response(
            {
                "success": True,
                "message": "Exam started successfully.",
                "attempt": attempt_data(attempt),
                "questions": [
                    question_data(question)
                    for question in exam.questions.all()
                ],
            },
            status=status.HTTP_201_CREATED,
        )


class SubmitExamAttemptView(StudentOnlyAPIView):
    """Validate answers and calculate the score on the server."""

    def post(self, request, attempt_id):
        with transaction.atomic():
            attempt = (
                ExamAttempt.objects.select_for_update()
                .filter(
                    id=attempt_id,
                    student=request.user,
                )
                .first()
            )

            if attempt is None:
                return Response(
                    {
                        "success": False,
                        "message": "Exam attempt not found.",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            if attempt.status != "in_progress":
                return Response(
                    {
                        "success": False,
                        "message": "This attempt is already closed.",
                        "attempt": attempt_data(attempt),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if exam_time_expired(attempt):
                attempt.status = "expired"
                attempt.submitted_at = timezone.now()
                attempt.save(
                    update_fields=["status", "submitted_at"]
                )

                return Response(
                    {
                        "success": False,
                        "message": "The exam time has expired.",
                        "attempt": attempt_data(attempt),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            answers = request.data.get("answers")

            if not isinstance(answers, list):
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Provide answers as a list of "
                            "question_id and selected_option."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            question_map = {
                question.id: question
                for question in attempt.exam.questions.all()
            }

            submitted_answers = {}

            for answer in answers:
                if not isinstance(answer, dict):
                    return Response(
                        {
                            "success": False,
                            "message": "Each answer must be an object.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                question_id = answer.get("question_id")
                selected_option = answer.get("selected_option", "")

                try:
                    question_id = int(question_id)
                except (TypeError, ValueError):
                    return Response(
                        {
                            "success": False,
                            "message": "Invalid question ID.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if question_id not in question_map:
                    return Response(
                        {
                            "success": False,
                            "message": (
                                "A submitted question does not "
                                "belong to this exam."
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if question_id in submitted_answers:
                    return Response(
                        {
                            "success": False,
                            "message": (
                                "A question cannot be answered "
                                "more than once."
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if selected_option not in {"", "A", "B", "C", "D"}:
                    return Response(
                        {
                            "success": False,
                            "message": "Invalid answer option.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                submitted_answers[question_id] = selected_option

            score = 0

            for question_id, question in question_map.items():
                selected_option = submitted_answers.get(
                    question_id, ""
                )

                awarded_marks = (
                    question.marks
                    if selected_option
                    == question.correct_option
                    else 0
                )

                score += awarded_marks

                ExamAnswer.objects.update_or_create(
                    attempt=attempt,
                    question=question,
                    defaults={
                        "selected_option": selected_option,
                        "awarded_marks": awarded_marks,
                    },
                )

            attempt.score = score
            attempt.status = "evaluated"
            attempt.submitted_at = timezone.now()
            attempt.save(
                update_fields=[
                    "score",
                    "status",
                    "submitted_at",
                ]
            )

        return Response({
            "success": True,
            "message": "Exam submitted successfully.",
            "result": {
                "attempt_id": attempt.id,
                "exam_id": attempt.exam_id,
                "score": score,
                "total_marks": attempt.exam.total_marks,
                "passing_marks": attempt.exam.passing_marks,
                "passed": score >= attempt.exam.passing_marks,
                "status": attempt.status,
                "submitted_at": attempt.submitted_at,
            },
        })


class StudentExamResultView(StudentOnlyAPIView):
    """Return the authenticated student's result and answer review."""

    def get(self, request, attempt_id):
        attempt = ExamAttempt.objects.filter(
            id=attempt_id,
            student=request.user,
        ).select_related("exam").first()

        if attempt is None:
            return Response(
                {
                    "success": False,
                    "message": "Exam attempt not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        expire_attempt_if_needed(attempt)

        if attempt.status not in {
            "submitted",
            "evaluated",
            "expired",
        }:
            return Response(
                {
                    "success": False,
                    "message": "Submit the exam before viewing results.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        answer_map = {
            answer.question_id: answer
            for answer in attempt.answers.select_related("question")
        }

        review = []

        for question in attempt.exam.questions.all():
            answer = answer_map.get(question.id)

            review.append({
                "question_id": question.id,
                "text": question.text,
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_c": question.option_c,
                "option_d": question.option_d,
                "selected_option": (
                    answer.selected_option if answer else ""
                ),
                "correct_option": question.correct_option,
                "awarded_marks": (
                    answer.awarded_marks if answer else 0
                ),
                "marks": question.marks,
                "explanation": question.explanation,
            })

        return Response({
            "success": True,
            "result": {
                "attempt_id": attempt.id,
                "exam_id": attempt.exam_id,
                "exam_title": attempt.exam.title,
                "course_name": attempt.exam.course_name,
                "score": attempt.score,
                "total_marks": attempt.exam.total_marks,
                "passing_marks": attempt.exam.passing_marks,
                "percentage": (
                    round(
                        attempt.score
                        / attempt.exam.total_marks * 100,
                        2,
                    )
                    if attempt.exam.total_marks > 0
                    else 0
                ),
                "passed": (
                    attempt.score >= attempt.exam.passing_marks
                ),
                "status": attempt.status,
                "started_at": attempt.started_at,
                "submitted_at": attempt.submitted_at,
            },
            "answers": review,
        })
