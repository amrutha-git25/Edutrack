
from rest_framework import generics
from rest_framework.permissions import IsAdminUser, IsAuthenticated

from .models import LiveClass
from .serializers import LiveClassSerializer
from io import BytesIO

from django.db.models import Q

from .models import Assignment, AssignmentSubmission
from .assignment_serializers import (
    AssignmentSerializer,
    AssignmentSubmissionSerializer,
)

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape

from rest_framework import status

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.users.models import Student
from apps.courses.courses.models import MentorAssignment
from .models import Certificate
from .serializers import (
    CertificateSerializer,
    CertificateIssueSerializer,
)

class LiveClassListCreateView(generics.ListCreateAPIView):
    queryset = LiveClass.objects.select_related(
        "mentor", "created_by"
    ).all()
    serializer_class = LiveClassSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class LiveClassDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = LiveClass.objects.select_related(
        "mentor", "created_by"
    ).all()
    serializer_class = LiveClassSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method in ["PUT", "PATCH", "DELETE"]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

class CertificateStudentListView(generics.ListAPIView):
    """List active students for the Admin certificate selector."""

    permission_classes = [IsAuthenticated, IsAdminUser]

    def list(self, request, *args, **kwargs):
        students = Student.objects.select_related("user").filter(
            is_active=True,
            user__is_active=True
        ).order_by("user__first_name", "user__last_name")

        data = [
            {
                "id": student.pk,
                "name": (
                    student.user.get_full_name()
                    or student.user.get_username()
                ),
                "pin_number": student.pin_number,
                "email": student.user.email,
                "branch": student.branch,
                "section": student.section,
            }
            for student in students
        ]

        return Response({
            "success": True,
            "message": "Students retrieved successfully.",
            "data": data,
        })


class CertificateListCreateView(generics.ListCreateAPIView):
    """List certificates and issue new certificates."""

    serializer_class = CertificateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Certificate.objects.select_related(
            "student__user",
            "course",
            "issued_by",
        )

        if self.request.user.is_staff or self.request.user.is_superuser:
            return queryset.all()

        try:
            student_profile = self.request.user.student_profile
        except (Student.DoesNotExist, AttributeError):
            return queryset.none()

        return queryset.filter(student=student_profile)

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsAdminUser()]

        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            self.get_queryset(),
            many=True
        )

        return Response({
            "success": True,
            "message": "Certificates retrieved successfully.",
            "data": serializer.data,
        })

    def create(self, request, *args, **kwargs):
        issue_serializer = CertificateIssueSerializer(
            data=request.data
        )
        issue_serializer.is_valid(raise_exception=True)

        certificate = issue_serializer.save(
            issued_by=request.user
        )

        serializer = CertificateSerializer(
            certificate,
            context={"request": request}
        )

        return Response({
            "success": True,
            "message": "Certificate issued successfully.",
            "data": serializer.data,
        }, status=status.HTTP_201_CREATED)


class CertificateDownloadView(APIView):
    """Download a branded EduTrack certificate as a landscape PDF."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        certificate = get_object_or_404(
            Certificate.objects.select_related(
                "student__user",
                "course",
                "issued_by",
            ),
            pk=pk,
        )

        is_admin = request.user.is_staff or request.user.is_superuser
        is_owner = certificate.student.user_id == request.user.id

        if not (is_admin or is_owner):
            return Response(
                {
                    "success": False,
                    "message": "You cannot download this certificate.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.pdfbase.pdfmetrics import stringWidth
            from reportlab.pdfgen import canvas
            from reportlab.graphics.barcode.qr import QrCodeWidget
            from reportlab.graphics.shapes import Drawing
            from reportlab.graphics import renderPDF
        except ImportError:
            return Response(
                {
                    "success": False,
                    "message": (
                        "PDF generation requires ReportLab. "
                        "Install it using: pip install reportlab"
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        student = certificate.student
        user = student.user
        student_name = (
            user.get_full_name().strip()
            or user.get_username()
            or "Student"
        )
        course_title = getattr(certificate.course, "title", None) or str(
            certificate.course
        )
        certificate_id = str(certificate.certificate_number)
        issued_date = timezone.localtime(
            certificate.issued_at
        ).strftime("%d %B %Y")

        # A4 landscape: 842 x 595 points.
        page_width, page_height = landscape(A4)
        buffer = BytesIO()
        pdf = canvas.Canvas(
            buffer,
            pagesize=(page_width, page_height),
            pageCompression=1,
        )

        navy = colors.HexColor("#211D50")
        purple = colors.HexColor("#5142E8")
        purple_dark = colors.HexColor("#352D91")
        gold = colors.HexColor("#CDA342")
        gold_light = colors.HexColor("#E8CB78")
        ink = colors.HexColor("#242044")
        muted = colors.HexColor("#596174")
        paper = colors.HexColor("#FFFEF8")

        def centered(text, y, font="Times-Roman", size=12, color=ink):
            pdf.setFont(font, size)
            pdf.setFillColor(color)
            pdf.drawCentredString(page_width / 2, y, str(text))

        def fitted_center(text, y, font, start_size, min_size, max_width, color):
            size = start_size
            while size > min_size and stringWidth(str(text), font, size) > max_width:
                size -= 1
            centered(text, y, font, size, color)

        def draw_corner(x, y, sx, sy):
            pdf.saveState()
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(0.9)
            for radius in (19, 29, 39):
                pdf.arc(
                    x if sx > 0 else x - radius * 2,
                    y if sy > 0 else y - radius * 2,
                    x + radius * 2 if sx > 0 else x,
                    y + radius * 2 if sy > 0 else y,
                    0 if sx * sy > 0 else 90,
                    90,
                )
            pdf.setFillColor(navy)
            pdf.circle(x, y, 2.5, fill=1, stroke=0)
            pdf.restoreState()

        def draw_certificate_background():
            pdf.setFillColor(paper)
            pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)

            # Fine diagonal paper texture.
            pdf.saveState()
            pdf.setStrokeColor(colors.HexColor("#F4F0E5"))
            pdf.setLineWidth(0.35)
            for offset in range(-int(page_height), int(page_width), 13):
                pdf.line(offset, 0, offset + page_height, page_height)
            pdf.restoreState()

            # Layered navy and gold frames.
            pdf.setStrokeColor(navy)
            pdf.setLineWidth(5.5)
            pdf.rect(13, 13, page_width - 26, page_height - 26, fill=0, stroke=1)
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(1.2)
            pdf.rect(24, 24, page_width - 48, page_height - 48, fill=0, stroke=1)
            pdf.setStrokeColor(navy)
            pdf.setLineWidth(0.8)
            pdf.rect(34, 34, page_width - 68, page_height - 68, fill=0, stroke=1)
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(0.7)
            pdf.rect(43, 43, page_width - 86, page_height - 86, fill=0, stroke=1)

            # Delicate repeating wave motif along all four edges.
            pdf.saveState()
            pdf.setLineWidth(0.55)
            for color in (purple, gold):
                pdf.setStrokeColor(color)
                for x in range(48, int(page_width - 48), 8):
                    y1 = 31 if color == purple else 34
                    pdf.bezier(
                        x, y1, x + 2, y1 + 7, x + 5, y1 + 7, x + 8, y1
                    )
                    top_y = page_height - y1
                    pdf.bezier(
                        x, top_y, x + 2, top_y - 7, x + 5, top_y - 7, x + 8, top_y
                    )
                for y in range(48, int(page_height - 48), 8):
                    x1 = 31 if color == purple else 34
                    pdf.bezier(x1, y, x1 + 7, y + 2, x1 + 7, y + 5, x1, y + 8)
                    right_x = page_width - x1
                    pdf.bezier(
                        right_x, y, right_x - 7, y + 2, right_x - 7, y + 5, right_x, y + 8
                    )
            pdf.restoreState()

            draw_corner(51, 51, 1, 1)
            draw_corner(page_width - 51, 51, -1, 1)
            draw_corner(51, page_height - 51, 1, -1)
            draw_corner(page_width - 51, page_height - 51, -1, -1)

        def draw_brand():
            # Compact EduTrack graduation-cap mark and wordmark.
            cx = page_width / 2
            logo_y = page_height - 108
            pdf.setFillColor(purple_dark)
            pdf.roundRect(cx - 174, logo_y - 13, 40, 40, 9, fill=1, stroke=0)
            pdf.setStrokeColor(colors.HexColor("#8A7AFF"))
            pdf.setLineWidth(1)
            pdf.roundRect(cx - 172, logo_y - 11, 36, 36, 7, fill=0, stroke=1)
            pdf.setFillColor(colors.white)
            pdf.setStrokeColor(colors.white)
            pdf.setLineWidth(1)
            pdf.wedge(cx - 165, logo_y + 1, cx - 143, logo_y + 15, 0, 180, fill=1, stroke=0)
            pdf.setFillColor(colors.HexColor("#DCE3FF"))
            pdf.rect(cx - 160, logo_y + 2, 12, 7, fill=1, stroke=0)
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(1.8)
            pdf.line(cx - 161, logo_y - 5, cx - 151, logo_y - 1)
            pdf.line(cx - 151, logo_y - 1, cx - 140, logo_y - 5)

            pdf.setFont("Helvetica-Bold", 27)
            pdf.setFillColor(navy)
            pdf.drawString(cx - 123, logo_y + 1, "Edu")
            pdf.setFillColor(purple)
            pdf.drawString(cx - 76, logo_y + 1, "Track")

        def draw_seal(cx, cy):
            # Gold embossed seal with ribbon tails.
            pdf.saveState()
            pdf.setFillColor(gold)
            pdf.setStrokeColor(colors.HexColor("#A87B24"))
            pdf.setLineWidth(1.2)
            pdf.circle(cx, cy, 45, fill=1, stroke=1)
            pdf.setFillColor(gold_light)
            pdf.circle(cx, cy, 38, fill=1, stroke=1)
            pdf.setStrokeColor(colors.HexColor("#9A711E"))
            pdf.setLineWidth(0.8)
            pdf.circle(cx, cy, 32, fill=0, stroke=1)
            pdf.setFillColor(purple)
            pdf.circle(cx, cy, 25, fill=1, stroke=0)
            pdf.setFillColor(colors.white)
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawCentredString(cx, cy + 31, "E D U T R A C K")
            pdf.setFillColor(navy)
            pdf.setFont("Helvetica-Bold", 6.5)
            pdf.drawCentredString(cx, cy - 34, "C E R T I F I E D")
            pdf.setFillColor(colors.white)
            pdf.setStrokeColor(colors.white)
            pdf.setLineWidth(1)
            pdf.wedge(cx - 15, cy - 4, cx + 15, cy + 12, 0, 180, fill=1, stroke=0)
            pdf.setFillColor(colors.HexColor("#DCE3FF"))
            pdf.rect(cx - 9, cy - 5, 18, 7, fill=1, stroke=0)
            pdf.setFillColor(gold)
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(2)
            pdf.line(cx + 14, cy + 5, cx + 14, cy - 8)
            pdf.circle(cx + 14, cy - 9, 1.5, fill=1, stroke=0)

            # Purple certificate ribbons.
            pdf.setFillColor(purple_dark)
            pdf.setStrokeColor(gold)
            pdf.setLineWidth(0.8)
            left_ribbon = pdf.beginPath()
            left_ribbon.moveTo(cx - 27, cy - 39)
            left_ribbon.lineTo(cx - 34, cy - 91)
            left_ribbon.lineTo(cx - 18, cy - 81)
            left_ribbon.lineTo(cx - 8, cy - 91)
            left_ribbon.lineTo(cx - 7, cy - 42)
            left_ribbon.close()
            pdf.drawPath(left_ribbon, fill=1, stroke=1)
            pdf.setFillColor(purple)
            right_ribbon = pdf.beginPath()
            right_ribbon.moveTo(cx + 7, cy - 42)
            right_ribbon.lineTo(cx + 8, cy - 91)
            right_ribbon.lineTo(cx + 19, cy - 81)
            right_ribbon.lineTo(cx + 34, cy - 91)
            right_ribbon.lineTo(cx + 27, cy - 39)
            right_ribbon.close()
            pdf.drawPath(right_ribbon, fill=1, stroke=1)
            pdf.restoreState()

        draw_certificate_background()
        draw_brand()

        centered("C E R T I F I C A T E", page_height - 178,
                 "Times-Bold", 48, navy)
        centered("◆  ───────────────    O F   A C H I E V E M E N T    ───────────────  ◆",
                 page_height - 204, "Helvetica-Bold", 10, purple)

        centered("This certificate is proudly presented to",
                 page_height - 246, "Times-Italic", 16, muted)
        fitted_center(
            student_name,
            page_height - 303,
            "Times-Italic",
            48,
            25,
            page_width - 150,
            purple_dark,
        )

        pdf.setStrokeColor(gold)
        pdf.setLineWidth(1.4)
        pdf.line(230, page_height - 314, page_width - 230, page_height - 314)
        pdf.setFillColor(gold)
        pdf.diamond if hasattr(pdf, "diamond") else None
        pdf.circle(page_width / 2, page_height - 314, 3.5, fill=1, stroke=0)

        centered("for successfully completing the course",
                 page_height - 348, "Times-Italic", 16, muted)
        fitted_center(
            course_title,
            page_height - 385,
            "Times-Bold",
            29,
            17,
            page_width - 180,
            purple,
        )

        # Date, central seal, signer and certificate identifier.
        pdf.setStrokeColor(navy)
        pdf.setLineWidth(0.6)
        pdf.line(155, 116, 323, 116)
        centered("ISSUED ON", 102, "Helvetica-Bold", 7.5, purple)
        pdf.setFont("Times-Bold", 16)
        pdf.setFillColor(navy)
        pdf.drawCentredString(239, 124, issued_date)

        draw_seal(page_width / 2, 137)

        pdf.setStrokeColor(navy)
        pdf.line(page_width - 335, 116, page_width - 170, 116)
        pdf.setFont("Helvetica-Bold", 7.5)
        pdf.setFillColor(purple)
        pdf.drawCentredString(page_width - 252, 102, "A U T H O R I Z E D   S I G N A T O R Y")
        pdf.setFont("Times-Italic", 12)
        pdf.setFillColor(muted)
        pdf.drawCentredString(page_width - 252, 89, "EduTrack")

        # QR contains the certificate's unique ID and the key certificate details.
        qr_text = (
            "EduTrack Certificate Verification\\n"
            f"Certificate ID: {certificate_id}\\n"
            f"Student: {student_name}\\n"
            f"Course: {course_title}\\n"
            f"Issued on: {issued_date}"
        )
        qr = QrCodeWidget(qr_text)
        qr_bounds = qr.getBounds()
        qr_width = qr_bounds[2] - qr_bounds[0]
        qr_height = qr_bounds[3] - qr_bounds[1]
        qr_size = 48
        drawing = Drawing(
            qr_size,
            qr_size,
            transform=[qr_size / qr_width, 0, 0, qr_size / qr_height, 0, 0],
        )
        drawing.add(qr)
        pdf.setStrokeColor(gold)
        pdf.setLineWidth(0.8)
        pdf.roundRect(page_width - 105, 74, 54, 62, 5, fill=0, stroke=1)
        renderPDF.draw(drawing, pdf, page_width - 102, 81)
        pdf.setFont("Helvetica-Bold", 5.8)
        pdf.setFillColor(gold)
        pdf.drawCentredString(page_width - 78, 65, "SCAN FOR DETAILS")

        pdf.setFont("Helvetica-Bold", 6.5)
        pdf.setFillColor(gold)
        pdf.drawString(96, 72, "CERTIFICATE ID")
        pdf.setFont("Helvetica", 8)
        pdf.setFillColor(navy)
        pdf.drawString(96, 58, certificate_id)

        pdf.showPage()
        pdf.save()
        pdf_bytes = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="EduTrack-Certificate-{certificate.pk}.pdf"'
        )
        return response


def is_student_user(user):
    """
    Verify that the authenticated user has a Student profile.
    This follows the existing Student profile relationship.
    """
    try:
        return user.student_profile.is_active
    except (Student.DoesNotExist, AttributeError):
        return False


def is_mentor_or_admin(user):
    """
    Use existing project profile relationships where available.
    Staff/superusers are treated as administrators.
    """
    if user.is_staff or user.is_superuser:
        return True

    return (
        hasattr(user, "mentor_profile")
        or hasattr(user, "mentor")
    )




def mentor_can_manage_course(user, course):
    """
    Check whether the authenticated user is assigned to this course.

    A course can be assigned directly through Course.mentor (User FK),
    or through the existing MentorAssignment records
    (MentorProfile -> user, linked to a student and course).
    """
    if user.is_staff or user.is_superuser:
        return True

    if course.mentor_id == user.id:
        return True

    # MentorAssignment.mentor is a MentorProfile, not the User itself.
    return MentorAssignment.objects.filter(
        course_id=course.pk,
        mentor__user_id=user.id,
    ).exists()
class MentorAssignmentListCreateView(generics.ListCreateAPIView):
    """Mentor assignment workspace: list own courses' assignments and create."""
    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Assignment.objects.select_related(
            "course", "created_by"
        ).prefetch_related("submissions")

        if user.is_staff or user.is_superuser:
            return queryset

        # Support both direct Course.mentor assignment and the existing
        # student-specific MentorAssignment -> MentorProfile -> User link.
        return queryset.filter(
            Q(course__mentor=user)
            | Q(course__student_mentor_assignments__mentor__user=user)
        ).distinct()

    def create(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser or hasattr(request.user, "mentor_profile")):
            return Response({"detail": "Mentor or admin access required."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.validated_data["course"]
        if not mentor_can_manage_course(request.user, course):
            return Response({"detail": "You can only create assignments for courses assigned to you."}, status=status.HTTP_403_FORBIDDEN)
        assignment = serializer.save(created_by=request.user)
        return Response({"success": True, "message": "Assignment created successfully.", "data": self.get_serializer(assignment).data}, status=status.HTTP_201_CREATED)


class MentorAssignmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, publish/archive, or delete an authorized assignment."""
    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "assignment_id"

    def get_queryset(self):
        user = self.request.user
        queryset = Assignment.objects.select_related("course", "created_by")

        if user.is_staff or user.is_superuser:
            return queryset

        # Support both direct Course.mentor assignment and the existing
        # student-specific MentorAssignment -> MentorProfile -> User link.
        return queryset.filter(
            Q(course__mentor=user)
            | Q(course__student_mentor_assignments__mentor__user=user)
        ).distinct()

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        course = serializer.validated_data.get("course", instance.course)
        if not mentor_can_manage_course(request.user, course):
            return Response({"detail": "You can only assign work to courses assigned to you."}, status=status.HTTP_403_FORBIDDEN)
        serializer.save()
        return Response({"success": True, "message": "Assignment updated successfully.", "data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.submissions.exists():
            return Response({"detail": "This assignment has submissions and cannot be deleted. Archive it instead."}, status=status.HTTP_400_BAD_REQUEST)
        instance.delete()
        return Response({"success": True, "message": "Assignment deleted successfully."}, status=status.HTTP_200_OK)


class StudentAssignmentListView(generics.ListAPIView):
    """
    GET /api/learning/assignments/

    Students see published assignments for courses they are enrolled in.
    Admins and mentors can view published assignments across courses.
    """

    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Assignment.objects.select_related(
            "course",
            "created_by",
        ).filter(status="published")

        user = self.request.user

        if user.is_staff or user.is_superuser:
            return queryset

        if not is_student_user(user):
            # Mentor access to this listing is allowed only for
            # authenticated mentor profiles.
            if is_mentor_or_admin(user):
                return queryset
            return queryset.none()

        # Use the existing enrollment relationship.
        # If your Enrollment model differs, adapt this filter
        # to the actual course-enrollment model in your project.
        try:
            student_profile = user.student_profile
            enrolled_course_ids = student_profile.enrollments.filter(
                status="active"
            ).values_list("course_id", flat=True)
            return queryset.filter(
                course_id__in=enrolled_course_ids
            )
        except (AttributeError, Student.DoesNotExist):
            return queryset.none()


class StudentAssignmentSubmissionView(APIView):
    """
    GET  /api/learning/assignments/<assignment_id>/submission/
    POST /api/learning/assignments/<assignment_id>/submission/

    Each student can access and update only their own submission.
    """

    permission_classes = [IsAuthenticated]

    def get_assignment(self, assignment_id):
        return get_object_or_404(
            Assignment,
            pk=assignment_id,
            status="published",
        )

    def get(self, request, assignment_id):
        if not is_student_user(request.user):
            return Response(
                {"detail": "Only students can access this endpoint."},
                status=status.HTTP_403_FORBIDDEN,
            )

        assignment = self.get_assignment(assignment_id)

        submission = AssignmentSubmission.objects.filter(
            assignment=assignment,
            student=request.user,
        ).first()

        if not submission:
            return Response(
                {
                    "success": True,
                    "data": None,
                    "message": "No submission has been made yet.",
                },
                status=status.HTTP_200_OK,
            )

        serializer = AssignmentSubmissionSerializer(
            submission,
            context={"request": request},
        )
        return Response(
            {"success": True, "data": serializer.data}
        )

    def post(self, request, assignment_id):
        if not is_student_user(request.user):
            return Response(
                {"detail": "Only students can submit assignments."},
                status=status.HTTP_403_FORBIDDEN,
            )

        assignment = self.get_assignment(assignment_id)

        # Ensure the student is enrolled in this assignment's course.
        try:
            student_profile = request.user.student_profile
            is_enrolled = student_profile.enrollments.filter(
                course_id=assignment.course_id,
                status="active",
            ).exists()
        except (AttributeError, Student.DoesNotExist):
            is_enrolled = False

        if not is_enrolled:
            return Response(
                {
                    "detail": (
                        "You must be enrolled in this course "
                        "to submit its assignment."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        
        existing = AssignmentSubmission.objects.filter(
            assignment=assignment,
            student=request.user,
        ).first()

        if existing and existing.status == "reviewed":
            return Response(
                {
                    "detail": (
                        "This submission has already been reviewed "
                        "and can no longer be changed."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data.copy()
        payload["assignment"] = assignment.pk

        serializer = AssignmentSubmissionSerializer(
            existing,
            data=payload,
            partial=bool(existing),
            context={"request": request},
        )

        serializer.is_valid(raise_exception=True)

        submission = serializer.save(
            student=request.user,
            status=(
                "late"
                if timezone.now() > assignment.due_date
                else "submitted"
            ),
        )

        response_serializer = AssignmentSubmissionSerializer(
            submission,
            context={"request": request},
        )

        return Response(
            {
                "success": True,
                "message": "Assignment submitted successfully.",
                "data": response_serializer.data,
            },
            status=(
                status.HTTP_200_OK
                if existing
                else status.HTTP_201_CREATED
            ),
        )


       

class AssignmentSubmissionListView(generics.ListAPIView):
    """
    GET /api/learning/assignments/<assignment_id>/submissions/

    Mentors/admins review submissions for an assignment.
    """

    serializer_class = AssignmentSubmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        assignment = get_object_or_404(
            Assignment,
            pk=self.kwargs["assignment_id"],
        )

        if not is_mentor_or_admin(self.request.user):
            return AssignmentSubmission.objects.none()

        # Mentors can only review submissions for courses assigned to them.
        if not (
            self.request.user.is_staff
            or self.request.user.is_superuser
        ):
            if not mentor_can_manage_course(
                self.request.user, assignment.course
            ):
                return AssignmentSubmission.objects.none()

        return AssignmentSubmission.objects.filter(
            assignment=assignment
        ).select_related("assignment", "student")


class GradeAssignmentSubmissionView(APIView):
    """
    PATCH /api/learning/submissions/<submission_id>/grade/

    Mentors/admins can review submissions and set grades/feedback.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, submission_id):
        user = request.user

        if not is_mentor_or_admin(user):
            return Response(
                {"detail": "Only mentors or admins can grade submissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        submission = get_object_or_404(
            AssignmentSubmission.objects.select_related(
                "assignment",
                "assignment__course",
            ),
            pk=submission_id,
        )

        if not (user.is_staff or user.is_superuser):
            if not mentor_can_manage_course(
                user, submission.assignment.course
            ):
                return Response(
                    {"detail": "You cannot grade this course's submissions."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        grade = request.data.get("grade")
        feedback = request.data.get("feedback", "")

        if grade is None:
            return Response(
                {"grade": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from decimal import Decimal, InvalidOperation

            grade_value = Decimal(str(grade))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {"grade": "Enter a valid numeric grade."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if grade_value < 0 or grade_value > submission.assignment.total_marks:
            return Response(
                {
                    "grade": (
                        f"Grade must be between 0 and "
                        f"{submission.assignment.total_marks}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        submission.grade = grade_value
        submission.feedback = feedback
        submission.status = "reviewed"
        submission.reviewed_by = user
        submission.reviewed_at = timezone.now()
        submission.save(
            update_fields=[
                "grade",
                "feedback",
                "status",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
            ]
        )

        serializer = AssignmentSubmissionSerializer(
            submission,
            context={"request": request},
        )

        return Response(
            {
                "success": True,
                "message": "Submission reviewed successfully.",
                "data": serializer.data,
            }
        )

class StudentCertificateDetailView(APIView):
    """
    Retrieve one certificate for preview.
    Students can only access their own certificates.
    Admins can access certificates for management.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        certificate = get_object_or_404(
            Certificate.objects.select_related(
                "student__user",
                "course",
                "issued_by",
            ),
            pk=pk,
        )

        is_admin = request.user.is_staff
        is_owner = certificate.student.user_id == request.user.id

        if not (is_admin or is_owner):
            return Response(
                {
                    "success": False,
                    "message": (
                        "You do not have permission to view "
                        "this certificate."
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CertificateSerializer(
            certificate,
            context={"request": request},
        )

        return Response(
            {
                "success": True,
                "message": "Certificate retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )