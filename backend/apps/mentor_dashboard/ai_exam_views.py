

import json
import os
import re

import requests
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsMentor
from apps.courses.courses.models import Course, MentorAssignment


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def get_openrouter_key():
    return (
        getattr(settings, "OPENROUTER_API_KEY", "")
        or os.getenv("OPENROUTER_API_KEY", "")
    )


def extract_json(content):
    """Extract a JSON object or array from an OpenRouter response."""
    if isinstance(content, list):
        content = "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict)
        )

    if not isinstance(content, str) or not content.strip():
        raise ValueError("The model returned an empty response.")

    content = content.strip()
    content = re.sub(
        r"```(?:json)?\s*", "", content, flags=re.IGNORECASE
    )
    content = content.replace("```", "").strip()

    try:
        parsed = json.loads(content)
        if isinstance(parsed, (dict, list)):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()

    for index, character in enumerate(content):
        if character not in "{[":
            continue
        try:
            parsed, _ = decoder.raw_decode(content[index:])
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            continue

    raise ValueError("No valid JSON object or array was found.")


def get_question_options(item):
    """Accept options as option_a/b/c/d or as an array/object."""
    options = item.get("options", [])

    if isinstance(options, dict):
        values = [
            options.get("A") or options.get("a"),
            options.get("B") or options.get("b"),
            options.get("C") or options.get("c"),
            options.get("D") or options.get("d"),
        ]
    elif isinstance(options, list) and len(options) >= 4:
        values = options[:4]
    else:
        values = [
            item.get("option_a") or item.get("optionA"),
            item.get("option_b") or item.get("optionB"),
            item.get("option_c") or item.get("optionC"),
            item.get("option_d") or item.get("optionD"),
        ]

    return {
        "option_a": str(values[0] or "").strip(),
        "option_b": str(values[1] or "").strip(),
        "option_c": str(values[2] or "").strip(),
        "option_d": str(values[3] or "").strip(),
    }


def normalize_correct_option(item):
    answer = str(
        item.get("correct_option")
        or item.get("correctAnswer")
        or item.get("correct_answer")
        or item.get("answer")
        or ""
    ).strip().upper()

    match = re.match(
        r"^(?:OPTION\s*)?([ABCD])(?:\b|[.):])",
        answer,
    )
    return match.group(1) if match else answer


class AIExamGenerateView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]
    throttle_scope = "ai_exam_generate"
    def post(self, request):
        course_name = str(
            request.data.get("course_name", "")
        ).strip()
        topics = str(request.data.get("topics", "")).strip()
        difficulty = str(
            request.data.get("difficulty", "Medium")
        ).strip()
        question_type = str(
            request.data.get("question_type", "MCQ")
        ).upper()

        try:
            count = int(request.data.get("question_count", 10))
        except (TypeError, ValueError):
            return Response(
                {"detail": "Question count must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not course_name or not topics:
            return Response(
                {"detail": "Course title and topics are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not 1 <= count <= 30:
            return Response(
                {"detail": "Choose between 1 and 30 questions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if difficulty not in {"Easy", "Medium", "Hard", "Mixed"}:
            return Response(
                {"detail": "Invalid difficulty selection."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if question_type != "MCQ":
            return Response(
                {"detail": "Only multiple-choice questions are supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user

        # Check that the mentor is assigned to this course.
        has_direct_assignment = Course.objects.filter(
            title__iexact=course_name,
            mentor=user,
        ).exists()

        has_profile_assignment = MentorAssignment.objects.filter(
            mentor__user=user,
            course__title__iexact=course_name,
        ).exists()

        if not (has_direct_assignment or has_profile_assignment):
            return Response(
                {
                    "detail": (
                        "This course is not assigned to your mentor account."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        api_key = get_openrouter_key()

        if not api_key:
            return Response(
                {
                    "detail": (
                        "OpenRouter is not configured. Set "
                        "OPENROUTER_API_KEY in the backend environment."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        model = (
            getattr(settings, "OPENROUTER_MODEL", "")
            or os.getenv("OPENROUTER_MODEL", "")
            or "openai/gpt-4o-mini"
        )

        prompt = f"""
Generate exactly {count} multiple-choice questions.

Course: {course_name}
Topics: {topics}
Requested difficulty: {difficulty}

Return a JSON object with a "questions" array:
{{
  "questions": [
    {{
      "text": "Question text",
      "option_a": "First option",
      "option_b": "Second option",
      "option_c": "Third option",
      "option_d": "Fourth option",
      "correct_option": "A",
      "marks": 1,
      "topic": "Topic",
      "difficulty": "Medium",
      "explanation": "Explanation"
    }}
  ]
}}

Requirements:
- Generate exactly {count} questions.
- Every question must have four non-empty options.
- Use a single correct answer: A, B, C, or D.
- Marks must be a positive integer.
- Difficulty must be Easy, Medium, or Hard.
- If requested difficulty is Mixed, vary the difficulty levels.
- Ensure questions are accurate, relevant and non-duplicated.
- Return JSON only, without Markdown fences or extra commentary.
"""

        try:
            response = requests.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": (
                        getattr(settings, "OPENROUTER_SITE_URL", "")
                        or os.getenv("OPENROUTER_SITE_URL", "")
                        or "http://localhost:5173"
                    ),
                    "X-Title": (
                        getattr(settings, "OPENROUTER_APP_NAME", "")
                        or os.getenv("OPENROUTER_APP_NAME", "")
                        or "EduTrack"
                    ),
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You generate educational MCQs. "
                                "Return valid JSON only."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                },
                timeout=90,
            )

            if not response.ok:
                # Keep provider credentials private; return a useful status.
                return Response(
                    {
                        "detail": (
                            "OpenRouter rejected the request. Check the "
                            "API key, model availability, and account credits."
                        ),
                        "provider_status": response.status_code,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            result = response.json()
            choices = result.get("choices") or []

            if not choices:
                raise ValueError(
                    "OpenRouter returned no choices."
                )

            message = choices[0].get("message") or {}
            content = message.get("content", "")

            parsed = extract_json(content)

            if isinstance(parsed, list):
                raw_questions = parsed
            elif isinstance(parsed, dict):
                raw_questions = (
                    parsed.get("questions")
                    or parsed.get("items")
                    or parsed.get("data")
                )
            else:
                raw_questions = None

            if not isinstance(raw_questions, list):
                raise ValueError(
                    "The response does not contain a question list."
                )

            questions = []

            for item in raw_questions:
                if not isinstance(item, dict):
                    continue

                question_text = str(
                    item.get("text")
                    or item.get("question")
                    or item.get("question_text")
                    or ""
                ).strip()

                options = get_question_options(item)
                correct = normalize_correct_option(item)

                try:
                    marks = int(item.get("marks", 1))
                except (TypeError, ValueError):
                    marks = 1

                level = str(
                    item.get(
                        "difficulty",
                        difficulty if difficulty != "Mixed" else "Medium",
                    )
                ).strip().title()

                if level not in {"Easy", "Medium", "Hard"}:
                    level = "Medium"

                if (
                    not question_text
                    or any(not value for value in options.values())
                    or correct not in {"A", "B", "C", "D"}
                    or marks < 1
                ):
                    continue

                questions.append({
                    "text": question_text,
                    **options,
                    "correct_option": correct,
                    "marks": marks,
                    "topic": str(
                        item.get("topic") or topics
                    ).strip(),
                    "difficulty": level,
                    "explanation": str(
                        item.get("explanation")
                        or item.get("rationale")
                        or ""
                    ).strip(),
                })

                if len(questions) >= count:
                    break

            if not questions:
                raise ValueError(
                    "No valid MCQs were found in the model response."
                )

            return Response(
                {
                    "success": True,
                    "course_name": course_name,
                    "questions": questions,
                    "question_count": len(questions),
                    "total_marks": sum(
                        question["marks"] for question in questions
                    ),
                },
                status=status.HTTP_200_OK,
            )

        except requests.Timeout:
            return Response(
                {
                    "detail": (
                        "OpenRouter took too long to respond. Please try again."
                    )
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )

        except requests.RequestException:
            return Response(
                {
                    "detail": (
                        "OpenRouter request failed. Check the network, "
                        "API key, and model access."
                    )
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            return Response(
                {
                    "detail": (
                        "Could not parse valid MCQs from the AI response. "
                        "Try again or choose another OpenRouter model."
                    ),
                    "reason": str(exc),
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
