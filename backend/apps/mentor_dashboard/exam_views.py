from django.apps import apps
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_services.ai_services.models import Exam, Question, ExamAttempt
from apps.courses.courses.models import Course, MentorAssignment

from .permissions import IsMentor


class MentorExamBaseView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def assigned_course_titles(self, user):
        """Return course titles assigned directly or through MentorAssignment."""
        titles = set(
            Course.objects.filter(
                mentor=user
            ).values_list("title", flat=True)
        )

        titles.update(
            MentorAssignment.objects.filter(
                mentor__user=user
            ).values_list("course__title", flat=True)
        )

        return titles

    def exam_queryset(self, user):
        """Return exams belonging to courses assigned to this mentor."""
        titles = self.assigned_course_titles(user)

        return Exam.objects.filter(
            course_name__in=titles
        ).prefetch_related("questions")

    def get_object(self, request, exam_id):
        """
        Retrieve an exam only if it belongs to a course assigned
        to the authenticated mentor.
        """
        return get_object_or_404(
            self.exam_queryset(request.user),
            pk=exam_id,
        )

    def exam_payload(self, exam, include_answers=False):
        questions = []

        for question in exam.questions.all():
            item = {
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

            if include_answers:
                item["correct_option"] = question.correct_option
                item["explanation"] = question.explanation

            questions.append(item)

        return {
            "id": exam.id,
            "title": exam.title,
            "description": exam.description,
            "course_name": exam.course_name,
            "duration_minutes": exam.duration_minutes,
            "total_marks": sum(
                question.marks
                for question in exam.questions.all()
            ),
            "passing_marks": exam.passing_marks,
            "status": exam.status,
            "question_count": len(questions),
            "created_at": exam.created_at,
            "updated_at": exam.updated_at,
            "questions": questions,
        }

    def validate_questions(self, questions):
        if not isinstance(questions, list) or not questions:
            return "Add at least one question."

        for index, question in enumerate(questions, start=1):
            if not isinstance(question, dict):
                return f"Question {index} must be an object."

            required_fields = (
                "text",
                "option_a",
                "option_b",
                "option_c",
                "option_d",
                "correct_option",
            )

            for field in required_fields:
                if not str(question.get(field, "")).strip():
                    return f"Question {index}: {field} is required."

            if str(question["correct_option"]).upper() not in (
                "A", "B", "C", "D"
            ):
                return (
                    f"Question {index}: "
                    "correct_option must be A, B, C or D."
                )

            try:
                marks = int(question.get("marks", 1))
            except (TypeError, ValueError):
                return (
                    f"Question {index}: "
                    "marks must be a positive integer."
                )

            if marks < 1:
                return f"Question {index}: marks must be at least 1."

        return None

    def save_questions(self, exam, questions):
        """Replace questions when editing a draft without attempts."""
        exam.questions.all().delete()

        Question.objects.bulk_create([
            Question(
                exam=exam,
                text=item["text"].strip(),
                option_a=item["option_a"].strip(),
                option_b=item["option_b"].strip(),
                option_c=item["option_c"].strip(),
                option_d=item["option_d"].strip(),
                correct_option=item["correct_option"].upper(),
                marks=int(item.get("marks", 1)),
                topic=item.get("topic", ""),
                difficulty=item.get("difficulty", "Medium"),
                explanation=item.get("explanation", ""),
            )
            for item in questions
        ])


class MentorExamListCreateView(MentorExamBaseView):

    def get(self, request):
        exams = self.exam_queryset(request.user).order_by("-created_at")
        results = []

        for exam in exams:
            item = self.exam_payload(exam)

            item["attempt_count"] = ExamAttempt.objects.filter(
                exam=exam,
                status="submitted",
            ).count()

            results.append(item)

        return Response({
            "success": True,
            "count": len(results),
            "results": results,
        })

    def post(self, request):
        data = request.data

        title = str(data.get("title", "")).strip()
        course_name = str(data.get("course_name", "")).strip()
        questions = data.get("questions")

        if not title:
            return Response(
                {
                    "success": False,
                    "message": "Exam title is required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if course_name not in self.assigned_course_titles(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Choose a course assigned to you.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        error = self.validate_questions(questions)

        if error:
            return Response(
                {
                    "success": False,
                    "message": error,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            duration = int(data.get("duration_minutes", 30))
            passing_marks = int(data.get("passing_marks", 0))
        except (TypeError, ValueError):
            return Response(
                {
                    "success": False,
                    "message": (
                        "Duration and passing marks must be integers."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if duration < 1 or passing_marks < 0:
            return Response(
                {
                    "success": False,
                    "message": (
                        "Duration must be positive and passing marks "
                        "cannot be negative."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_marks = sum(
            int(question.get("marks", 1))
            for question in questions
        )

        if passing_marks > total_marks:
            return Response(
                {
                    "success": False,
                    "message": (
                        "Passing marks cannot exceed total marks."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            exam = Exam.objects.create(
                title=title,
                description=str(data.get("description", "")).strip(),
                course_name=course_name,
                duration_minutes=duration,
                total_marks=total_marks,
                passing_marks=passing_marks,
                status="draft",
                created_by=request.user,
            )

            self.save_questions(exam, questions)

        return Response(
            {
                "success": True,
                "message": "Exam saved as draft.",
                "exam": self.exam_payload(
                    exam,
                    include_answers=True,
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class MentorExamDetailView(MentorExamBaseView):

    def get_object(self, request, exam_id):
        return get_object_or_404(
            self.exam_queryset(request.user),
            pk=exam_id,
        )

    def get(self, request, exam_id):
        exam = self.get_object(request, exam_id)

        return Response({
            "success": True,
            "exam": self.exam_payload(
                exam,
                include_answers=True,
            ),
        })

    def patch(self, request, exam_id):
        exam = self.get_object(request, exam_id)

        if exam.created_by_id != request.user.id:
            return Response(
                {
                    "success": False,
                    "message": (
                        "You can only edit exams you created."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if exam.status != "draft":
            return Response(
                {
                    "success": False,
                    "message": (
                        "Only draft exams can be edited. "
                        "Close or manage this exam separately."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        if ExamAttempt.objects.filter(exam=exam).exists():
            return Response(
                {
                    "success": False,
                    "message": (
                        "This exam already has attempts "
                        "and cannot be edited."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        data = request.data

        new_course = str(
            data.get("course_name", exam.course_name)
        ).strip()

        if new_course not in self.assigned_course_titles(request.user):
            return Response(
                {
                    "success": False,
                    "message": "Choose a course assigned to you.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        questions = data.get("questions")

        if questions is not None:
            error = self.validate_questions(questions)

            if error:
                return Response(
                    {
                        "success": False,
                        "message": error,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            duration = int(
                data.get("duration_minutes", exam.duration_minutes)
            )
            passing_marks = int(
                data.get("passing_marks", exam.passing_marks)
            )
        except (TypeError, ValueError):
            return Response(
                {
                    "success": False,
                    "message": (
                        "Duration and passing marks must be integers."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if duration < 1 or passing_marks < 0:
            return Response(
                {
                    "success": False,
                    "message": "Invalid duration or passing marks.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if questions is not None:
            total_marks = sum(
                int(question.get("marks", 1))
                for question in questions
            )
        else:
            total_marks = sum(
                question.marks
                for question in exam.questions.all()
            )

        if passing_marks > total_marks:
            return Response(
                {
                    "success": False,
                    "message": (
                        "Passing marks cannot exceed total marks."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            exam.title = str(
                data.get("title", exam.title)
            ).strip()

            exam.description = str(
                data.get("description", exam.description)
            ).strip()

            exam.course_name = new_course
            exam.duration_minutes = duration
            exam.passing_marks = passing_marks
            exam.total_marks = total_marks
            exam.save()

            if questions is not None:
                self.save_questions(exam, questions)

        return Response({
            "success": True,
            "message": "Exam updated successfully.",
            "exam": self.exam_payload(
                exam,
                include_answers=True,
            ),
        })

    def delete(self, request, exam_id):
        exam = self.get_object(request, exam_id)

        if exam.created_by_id != request.user.id:
            return Response(
                {
                    "success": False,
                    "message": (
                        "You can only delete exams you created."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            exam.status != "draft"
            or ExamAttempt.objects.filter(exam=exam).exists()
        ):
            return Response(
                {
                    "success": False,
                    "message": (
                        "Only draft exams without attempts "
                        "can be deleted."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        exam.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class MentorExamAvailabilityView(MentorExamBaseView):

    def post(self, request, exam_id):
        exam = get_object_or_404(
            self.exam_queryset(request.user),
            pk=exam_id,
            created_by=request.user,
        )

        action = str(
            request.data.get("action", "")
        ).strip().lower()

        if action == "publish":
            if exam.status != "draft":
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Only draft exams can be published."
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            if not exam.questions.exists():
                return Response(
                    {
                        "success": False,
                        "message": "Add questions before publishing.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            exam.total_marks = sum(
                question.marks
                for question in exam.questions.all()
            )

            if exam.passing_marks > exam.total_marks:
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Passing marks cannot exceed total marks."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            exam.status = "published"

        elif action == "close":
            if exam.status != "published":
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Only published exams can be closed."
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            exam.status = "closed"

        else:
            return Response(
                {
                    "success": False,
                    "message": (
                        "action must be 'publish' or 'close'."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.save()

        return Response({
            "success": True,
            "message": f"Exam {exam.status} successfully.",
            "exam": self.exam_payload(exam),
        })


class MentorExamResultsView(MentorExamBaseView):

    def get(self, request, exam_id):
        # Fixed: get_object() is now inherited from MentorExamBaseView.
        exam = self.get_object(request, exam_id)

        attempts = (
            ExamAttempt.objects.filter(
                exam=exam,
                status="submitted",
            )
            .select_related("student")
            .order_by("-submitted_at", "-started_at")
        )

        total_marks = sum(
            question.marks
            for question in exam.questions.all()
        )

        results = []

        for attempt in attempts:
            student = attempt.student

            score = attempt.score or 0

            results.append({
                "attempt_id": attempt.id,
                "student_id": student.id,
                "student_name": (
                    student.get_full_name()
                    or student.get_username()
                ),
                "student_email": student.email,
                "score": score,
                "total_marks": total_marks,
                "passing_marks": exam.passing_marks,
                "percentage": (
                    round(score * 100 / total_marks, 2)
                    if total_marks
                    else 0
                ),
                "passed": score >= exam.passing_marks,
                "started_at": attempt.started_at,
                "submitted_at": attempt.submitted_at,
                "status": attempt.status,
            })

        return Response({
            "success": True,
            "exam": {
                "id": exam.id,
                "title": exam.title,
                "course_name": exam.course_name,
            },
            "count": len(results),
            "results": results,
        })