import json
import os
import re
import urllib.error
import urllib.request

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StudentResume


def _is_student(user):
    if not user or not user.is_authenticated:
        return False
    if user.groups.filter(name__iexact="STUDENT").exists():
        return True
    role = getattr(user, "role", None)
    role = getattr(role, "name", role)
    return str(role or "").strip().lower() == "student"


def _student_required(request):
    if not _is_student(request.user):
        return Response(
            {"success": False, "message": "Student access is required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _resume_payload(resume):
    return {
        "id": resume.pk,
        "title": resume.title,
        "target_role": resume.target_role,
        "template": resume.template,
        "content": resume.content or {},
        "is_primary": resume.is_primary,
        "created_at": resume.created_at,
        "updated_at": resume.updated_at,
    }


def _clean_text(value, limit=12000):
    if value is None:
        return ""
    return str(value).strip()[:limit]


def _call_openrouter(messages, max_tokens=900):
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is missing from the backend environment. "
            "Add it to backend/.env and restart Django."
        )

    model = os.environ.get("OPENROUTER_MODEL", "openrouter/free").strip()
    body = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.45,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL", "http://localhost:5173"),
            "X-Title": "EduTrack AI Resume Builder",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8")
            parsed = json.loads(detail)
            detail = parsed.get("error", {}).get("message", detail)
        except Exception:
            detail = "OpenRouter rejected the request."
        raise RuntimeError(detail) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError("Unable to connect to the AI service. Please try again.") from exc

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    content = str(content or "").strip()
    if not content:
        raise RuntimeError("The AI service returned an empty response.")
    return content


class StudentResumeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _student_required(request)
        if denied:
            return denied
        resumes = StudentResume.objects.filter(student=request.user)
        return Response({
            "success": True,
            "resumes": [_resume_payload(item) for item in resumes],
        })

    def post(self, request):
        denied = _student_required(request)
        if denied:
            return denied

        title = _clean_text(request.data.get("title") or "My Resume", 150)
        target_role = _clean_text(request.data.get("target_role"), 150)
        content = request.data.get("content") or {}
        template = _clean_text(request.data.get("template") or "modern", 30)

        if not isinstance(content, dict):
            return Response(
                {"success": False, "message": "Resume content must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            if request.data.get("is_primary"):
                StudentResume.objects.filter(student=request.user).update(is_primary=False)
            resume = StudentResume.objects.create(
                student=request.user,
                title=title,
                target_role=target_role,
                template=template,
                content=content,
                is_primary=bool(request.data.get("is_primary", False)),
            )

        return Response({
            "success": True,
            "message": "Resume saved successfully.",
            "resume": _resume_payload(resume),
        }, status=status.HTTP_201_CREATED)


class StudentResumeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, resume_id):
        return get_object_or_404(StudentResume, pk=resume_id, student=request.user)

    def get(self, request, resume_id):
        denied = _student_required(request)
        if denied:
            return denied
        return Response({"success": True, "resume": _resume_payload(self.get_object(request, resume_id))})

    def patch(self, request, resume_id):
        denied = _student_required(request)
        if denied:
            return denied
        resume = self.get_object(request, resume_id)

        for field, limit in (("title", 150), ("target_role", 150), ("template", 30)):
            if field in request.data:
                setattr(resume, field, _clean_text(request.data[field], limit))

        if "content" in request.data:
            if not isinstance(request.data["content"], dict):
                return Response(
                    {"success": False, "message": "Resume content must be an object."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resume.content = request.data["content"]

        if request.data.get("is_primary") is True:
            with transaction.atomic():
                StudentResume.objects.filter(student=request.user).update(is_primary=False)
                resume.is_primary = True
                resume.save()
        else:
            resume.save()

        return Response({
            "success": True,
            "message": "Resume updated successfully.",
            "resume": _resume_payload(resume),
        })

    def delete(self, request, resume_id):
        denied = _student_required(request)
        if denied:
            return denied
        resume = self.get_object(request, resume_id)
        resume.delete()
        return Response({"success": True, "message": "Resume deleted successfully."})


class StudentResumeAIImproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _student_required(request)
        if denied:
            return denied

        section = _clean_text(request.data.get("section"), 50)
        text = _clean_text(request.data.get("text"), 12000)
        target_role = _clean_text(request.data.get("target_role"), 150)
        action = _clean_text(request.data.get("action") or "improve", 30)

        if not text:
            return Response(
                {"success": False, "message": "Enter some content before asking AI to improve it."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action not in {"improve", "summary", "skills", "project"}:
            action = "improve"

        system_prompt = (
            "You are an expert ATS resume writer and career coach. "
            "Write concise, truthful, professional resume content. "
            "Never invent employers, dates, qualifications, skills, metrics, awards, "
            "certifications, or achievements. Preserve all factual details supplied. "
            "If information is missing, use neutral wording rather than fabricating it. "
            "Return only the revised text, without markdown fences or commentary."
        )
        user_prompt = (
            f"Task: {action}\nResume section: {section or 'general'}\n"
            f"Target role: {target_role or 'general entry-level role'}\n\n"
            f"Student-provided information:\n{text}\n\n"
            "Improve clarity, action verbs, relevance, grammar and ATS readability. "
            "Keep it appropriate for a student or fresher."
        )

        try:
            improved = _call_openrouter(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=700,
            )
        except RuntimeError as exc:
            return Response(
                {"success": False, "message": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "success": True,
            "section": section,
            "improved_text": improved.strip(),
            "message": "AI suggestions generated. Review them before using.",
        })


class StudentResumeGenerateSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _student_required(request)
        if denied:
            return denied

        content = request.data.get("content") or {}
        if not isinstance(content, dict):
            return Response(
                {"success": False, "message": "Resume content must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_role = _clean_text(request.data.get("target_role"), 150)
        compact = {
            "education": content.get("education", []),
            "skills": content.get("skills", []),
            "projects": content.get("projects", []),
            "internships": content.get("internships", []),
            "certifications": content.get("certifications", []),
            "achievements": content.get("achievements", []),
        }
        prompt = (
            "Write a 3-4 sentence professional summary for a student/fresher resume. "
            "Use only the facts in the supplied JSON. Do not invent experience, "
            "proficiency, metrics or credentials. Return only the summary.\n\n"
            f"Target role: {target_role or 'Entry-level role'}\n"
            f"Student profile: {json.dumps(compact, ensure_ascii=False)[:14000]}"
        )
        try:
            summary = _call_openrouter(
                [
                    {"role": "system", "content": "You write truthful, ATS-friendly fresher resume summaries."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=350,
            )
        except RuntimeError as exc:
            return Response(
                {"success": False, "message": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"success": True, "summary": summary.strip()})


urlpatterns_note = """
Add these routes to apps/ai_services/ai_services/urls.py:
path("student/resumes/", StudentResumeListCreateView.as_view(), name="student-resume-list-create"),
path("student/resumes/<int:resume_id>/", StudentResumeDetailView.as_view(), name="student-resume-detail"),
path("student/resumes/ai-improve/", StudentResumeAIImproveView.as_view(), name="student-resume-ai-improve"),
path("student/resumes/ai-summary/", StudentResumeGenerateSummaryView.as_view(), name="student-resume-ai-summary"),
"""
