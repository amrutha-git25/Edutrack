
import json
import logging
import os

import requests
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _request_questions(course, topics, difficulty, count, existing_texts=None):
    """Request a batch of MCQs from OpenRouter without saving them."""

    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    if not api_key:
        raise APIException("OPENROUTER_API_KEY is missing from the backend environment.")

    avoid_texts = existing_texts or []

    prompt = f"""
Create exactly {count} original multiple-choice questions.

Course: {course}
Topics: {", ".join(topics)}
Difficulty: {difficulty}

Avoid creating questions similar to these already generated questions:
{json.dumps(avoid_texts[:40])}

Return a JSON object:
{{
  "questions": [
    {{
      "text": "Question text",
      "option_a": "Option A",
      "option_b": "Option B",
      "option_c": "Option C",
      "option_d": "Option D",
      "correct_option": "A",
      "marks": 1,
      "explanation": "Explanation",
      "difficulty": "Easy",
      "topic": "Functions"
    }}
  ]
}}

Rules:
- Return exactly {count} questions.
- Four distinct options per question.
- Only one correct answer.
- correct_option must be A, B, C, or D.
- marks must be a positive integer.
- difficulty must be Easy, Medium, or Hard.
- For Mixed difficulty, vary the difficulty levels.
- Cover the requested topics.
- Return valid JSON only, without Markdown fences.
"""

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert computer science educator. "
                    "Generate accurate, unambiguous MCQs. Return valid JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": min(16000, max(3000, count * 500)),
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5173",
                "X-OpenRouter-Title": "EduTrack",
            },
            json=payload,
            timeout=120,
        )

        if not response.ok:
            logger.error(
                "OpenRouter HTTP %s: %s",
                response.status_code,
                response.text[:1000],
            )
            raise APIException(
                "OpenRouter request failed. Check your API key, credits, "
                "model availability, and backend terminal."
            )

        body = response.json()
        content = body["choices"][0]["message"]["content"]
        result = json.loads(content)
        questions = result.get("questions")

    except APIException:
        raise
    except requests.RequestException as exc:
        logger.exception("OpenRouter network error")
        raise APIException("Could not connect to OpenRouter.") from exc
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        logger.exception("Invalid OpenRouter response")
        raise APIException(
            "OpenRouter returned invalid JSON or an unexpected response."
        ) from exc

    if not isinstance(questions, list):
        raise APIException("OpenRouter did not return a valid questions list.")

    validated = []

    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            continue

        text = question.get("text")
        option_keys = ["option_a", "option_b", "option_c", "option_d"]
        options = [question.get(key) for key in option_keys]

        if not isinstance(text, str) or not text.strip():
            continue

        if not all(isinstance(option, str) and option.strip() for option in options):
            continue

        if len({option.strip().casefold() for option in options}) != 4:
            continue

        answer = question.get("correct_option")
        if answer not in ["A", "B", "C", "D"]:
            continue

        marks = question.get("marks", 1)
        if not isinstance(marks, int) or isinstance(marks, bool) or marks < 1:
            continue

        level = question.get("difficulty", "Medium")
        if level not in ["Easy", "Medium", "Hard"]:
            level = "Medium"

        validated.append({
            "text": text.strip(),
            "option_a": options[0].strip(),
            "option_b": options[1].strip(),
            "option_c": options[2].strip(),
            "option_d": options[3].strip(),
            "correct_option": answer,
            "marks": marks,
            "explanation": str(question.get("explanation", "")),
            "difficulty": level,
            "topic": str(question.get("topic", "")),
        })

    return validated


def generate_mcqs(course, topics, difficulty="Mixed", count=20):
    """
    Generate exactly the requested number of valid MCQs.
    Returns questions for review; never saves them to the database.
    """

    if not isinstance(count, int) or isinstance(count, bool) or not 1 <= count <= 50:
        raise APIException("Question count must be between 1 and 50.")

    if not isinstance(topics, list) or not topics:
        raise APIException("At least one topic is required.")

    questions = []
    seen_texts = set()

    # Initial batch plus at most two attempts to fill any shortfall.
    for attempt in range(3):
        remaining = count - len(questions)

        if remaining <= 0:
            break

        batch = _request_questions(
            course=course,
            topics=topics,
            difficulty=difficulty,
            count=remaining,
            existing_texts=[item["text"] for item in questions],
        )

        for question in batch:
            normalized = " ".join(question["text"].casefold().split())

            if normalized in seen_texts:
                continue

            seen_texts.add(normalized)
            questions.append(question)

            if len(questions) == count:
                break

    if len(questions) != count:
        logger.warning(
            "Only %s of %s unique questions generated after retries.",
            len(questions),
            count,
        )
        raise APIException(
            f"Could generate only {len(questions)} valid unique questions "
            f"out of {count} after retries. Try again or request fewer questions."
        )

    return questions
