
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_services.ai_services.models import Exam, Question

from .ai_exam_service import generate_mcqs
from .permissions import IsEduTrackAdmin
from .serializers import (
    AIExamGenerationSerializer,
    AIExamSaveSerializer,
)


class GenerateAIExamView(APIView):
    """
    Generate MCQs using OpenRouter.
    Questions are returned for review and are NOT saved.
    """

    permission_classes = [IsAuthenticated, IsEduTrackAdmin]

    def post(self, request):
        serializer = AIExamGenerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        settings = serializer.validated_data

        questions = generate_mcqs(
            course=settings["course"],
            topics=settings["topics"],
            difficulty=settings["difficulty"],
            count=settings["count"],
        )

        return Response(
            {
                "success": True,
                "message": "Questions generated. Review them before saving.",
                "course": settings["course"],
                "topics": settings["topics"],
                "difficulty": settings["difficulty"],
                "duration_minutes": settings["duration_minutes"],
                "question_count": len(questions),
                "questions": questions,
                "saved": False,
                "review_required": True,
            },
            status=status.HTTP_200_OK,
        )


class SaveAIExamView(APIView):
    """
    Save admin-reviewed questions as a draft.
    """

    permission_classes = [IsAuthenticated, IsEduTrackAdmin]

    def post(self, request):
        serializer = AIExamSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        reviewed_questions = data["questions"]

        total_marks = sum(
            question["marks"] for question in reviewed_questions
        )

        passing_marks = data["passing_marks"]

        if passing_marks > total_marks:
            return Response(
                {
                    "success": False,
                    "error": "Passing marks cannot exceed total marks.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Map only fields accepted by the existing Exam model.
        exam_data = {
            "title": data["title"],
            "description": data.get("description", ""),
            "course_name": data["course_name"],
            "duration_minutes": data["duration_minutes"],
            "total_marks": total_marks,
            "passing_marks": passing_marks,
            "status": "draft",
            "created_by": request.user,
        }

        try:
            with transaction.atomic():
                exam = Exam.objects.create(**exam_data)

                question_objects = []

                for question_data in reviewed_questions:
                    question_objects.append(
                        Question(
                            exam=exam,
                            text=question_data["text"],
                            option_a=question_data["option_a"],
                            option_b=question_data["option_b"],
                            option_c=question_data["option_c"],
                            option_d=question_data["option_d"],
                            correct_option=question_data["correct_option"],
                            marks=question_data["marks"],
                        )
                    )

                Question.objects.bulk_create(question_objects)

        except Exception:
            # The transaction rolls back if exam or question creation fails.
            raise

        return Response(
            {
                "success": True,
                "message": "Reviewed exam saved successfully as a draft.",
                "exam_id": exam.pk,
                "title": exam.title,
                "status": exam.status,
                "question_count": len(question_objects),
                "total_marks": total_marks,
            },
            status=status.HTTP_201_CREATED,
        )
