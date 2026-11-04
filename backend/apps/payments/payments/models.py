
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class FeeRecord(models.Model):
    class PaymentType(models.TextChoices):
        ONE_TIME = "one_time", "One Time"
        INSTALLMENT = "installment", "Installment"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        ARCHIVED = "archived", "Archived"

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="fee_records",
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_records",
    )

    total_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    pending_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    payment_type = models.CharField(
        max_length=20,
        choices=PaymentType.choices,
        default=PaymentType.ONE_TIME,
    )

    due_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True, default="")

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    is_archived = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_fee_records",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["due_date", "status"]),
            models.Index(fields=["is_archived"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_fee__gt=0),
                name="fee_total_positive",
            ),
            models.CheckConstraint(
                condition=Q(discount__gte=0) & Q(discount__lte=models.F("total_fee")),
                name="fee_discount_valid",
            ),
            models.CheckConstraint(
                condition=Q(pending_amount__gte=0)
                & Q(pending_amount__lte=models.F("total_fee")),
                name="fee_pending_valid",
            ),
        ]

    @property
    def net_fee(self):
        return self.total_fee - self.discount

    def __str__(self):
        return f"Fee #{self.pk} - {self.student}"


class Payment(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        ONLINE = "online", "Online"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    fee_record = models.ForeignKey(
        FeeRecord,
        on_delete=models.PROTECT,
        related_name="payments",
    )

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="fee_payments",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )

    transaction_id = models.CharField(
        max_length=150,
        blank=True,
        default="",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUCCESS,
    )

    notes = models.TextField(blank=True, default="")

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_fee_payments",
    )

    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["fee_record", "status"]),
            models.Index(fields=["paid_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="payment_amount_positive",
            ),
            models.UniqueConstraint(
                fields=["transaction_id"],
                condition=~Q(transaction_id=""),
                name="unique_nonempty_payment_transaction_id",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.status == self.Status.SUCCESS and self.paid_at is None:
            from django.utils import timezone
            self.paid_at = timezone.now()

        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment #{self.pk} - ₹{self.amount}"
