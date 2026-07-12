"""
CoopSys API Serializers
=======================
These serializers output JSON in the exact shape the CoopX React frontend
expects (matching the old Supabase column names), so the frontend needs
minimal changes.
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from decimal import Decimal
from .models import (
    Member, Savings, Loan, Repayment, Contribution,
    Transaction, Notification, MLPrediction, CoopSettings, BankAccount, ExchangeRate
)


# ─── PROFILE (maps Member → profiles table shape) ────────────────────────────

class ProfileSerializer(serializers.ModelSerializer):
    """Maps Member → the 'profiles' shape CoopX expects."""
    id = serializers.CharField(source="member_id", read_only=True)
    full_name = serializers.SerializerMethodField()
    joined_at = serializers.DateField(source="join_date", read_only=True)
    member_code = serializers.CharField(source="member_id", read_only=True)
    status = serializers.SerializerMethodField()
    verified_email = serializers.SerializerMethodField()
    verified_phone = serializers.SerializerMethodField()
    suspension_reason = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Member
        fields = [
            "id", "full_name", "email", "phone", "member_code", "joined_at",
            "status", "verified_email", "verified_phone", "suspension_reason",
            "role", "is_admin",
        ]

    def get_full_name(self, obj):
        return obj.full_name

    def get_status(self, obj):
        # Map Django status → CoopX status vocabulary
        mapping = {
            "active": "Approved",
            "inactive": "Inactive",
            "suspended": "Suspended",
        }
        return mapping.get(obj.status, "Pending")

    def get_verified_email(self, obj):
        return True

    def get_verified_phone(self, obj):
        return bool(obj.phone)

    def get_suspension_reason(self, obj):
        return None


# ─── LOAN (maps Loan → loans table shape) ────────────────────────────────────

class LoanSerializer(serializers.ModelSerializer):
    member_id = serializers.CharField(source="member.member_id", read_only=True)
    member_name = serializers.SerializerMethodField()
    amount = serializers.DecimalField(source="amount_requested", max_digits=12, decimal_places=2)
    tenure_months = serializers.IntegerField()
    rate = serializers.DecimalField(source="interest_rate", max_digits=5, decimal_places=2)
    emi = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    ml_risk_probability = serializers.FloatField(source="risk_probability", read_only=True)
    ml_risk_level = serializers.CharField(source="risk_score", read_only=True)
    ml_factors = serializers.SerializerMethodField()
    admin_note = serializers.CharField(source="rejection_reason", read_only=True)
    paid = serializers.SerializerMethodField()
    applied_at = serializers.DateField(source="application_date", read_only=True)
    decided_at = serializers.DateField(source="approval_date", read_only=True)

    class Meta:
        model = Loan
        fields = [
            "id", "member_id", "member_name", "amount", "tenure_months", "rate",
            "emi", "purpose", "status", "ml_risk_probability", "ml_risk_level",
            "ml_factors", "admin_note", "paid", "applied_at", "decided_at",
        ]

    def get_member_name(self, obj):
        return obj.member.full_name

    def get_emi(self, obj):
        return float(obj.monthly_emi)

    def get_status(self, obj):
        # Map Django loan status → CoopX vocabulary
        mapping = {
            "pending": "Pending",
            "approved": "Approved",
            "active": "Disbursed",
            "overdue": "Overdue",
            "repaid": "Repaid",
            "rejected": "Rejected",
            "cancelled": "Rejected",
        }
        return mapping.get(obj.status, "Pending")

    def get_ml_factors(self, obj):
        # Uses the prefetched list (see api_loans) to avoid an N+1 query per
        # loan; falls back to a direct query if the view didn't prefetch it.
        predictions = getattr(obj, "_prefetched_predictions", None)
        if predictions is not None:
            pred = predictions[0] if predictions else None
        else:
            pred = obj.mlprediction_set.order_by("-prediction_date").first() if hasattr(obj, "mlprediction_set") else None
        if pred and pred.feature_importances:
            return pred.feature_importances
        return []

    def get_paid(self, obj):
        return float(obj.total_repaid)


# ─── SAVINGS TRANSACTION (maps Savings + Transaction → savings_transactions) ──

class SavingsTransactionSerializer(serializers.ModelSerializer):
    member_id = serializers.CharField(source="member.member_id", read_only=True)
    type = serializers.SerializerMethodField()
    note = serializers.CharField(source="description", read_only=True)
    occurred_at = serializers.DateField(source="date", read_only=True)

    class Meta:
        model = Savings
        fields = ["id", "member_id", "type", "amount", "note", "occurred_at"]

    def get_type(self, obj):
        mapping = {
            "deposit": "Contribution",
            "withdrawal": "Withdrawal",
            "dividend": "Loan Disbursement",
        }
        return mapping.get(obj.transaction_type, "Contribution")


# ─── LOAN REPAYMENT ──────────────────────────────────────────────────────────

class RepaymentSerializer(serializers.ModelSerializer):
    loan_id = serializers.CharField(source="loan.loan_id", read_only=True)
    member_id = serializers.CharField(source="loan.member.member_id", read_only=True)
    paid_at = serializers.DateField(source="payment_date", read_only=True)

    class Meta:
        model = Repayment
        fields = ["id", "loan_id", "member_id", "amount", "paid_at"]


# ─── NOTIFICATION ────────────────────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    user_id = serializers.SerializerMethodField()
    body = serializers.CharField(source="message", read_only=True)
    type = serializers.SerializerMethodField()
    read = serializers.BooleanField(source="is_read", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "user_id", "title", "body", "type", "read", "created_at"]

    def get_user_id(self, obj):
        return str(obj.recipient_id)

    def get_type(self, obj):
        mapping = {
            "loan_approved": "success",
            "loan_rejected": "error",
            "loan_due": "warning",
            "repayment_confirmed": "success",
            "savings_credited": "success",
            "contribution_due": "warning",
            "risk_alert": "warning",
            "general": "info",
        }
        return mapping.get(obj.notification_type, "info")


# ─── ANNOUNCEMENT (uses Notification with type=general as announcements) ──────

class AnnouncementSerializer(serializers.Serializer):
    """Announcements are stored as a lightweight standalone concept."""
    id = serializers.CharField(read_only=True)
    title = serializers.CharField()
    body = serializers.CharField()
    priority = serializers.CharField(default="normal")
    created_by = serializers.CharField(allow_null=True, required=False)
    created_at = serializers.DateTimeField(read_only=True)


# ─── AUDIT LOG (maps Transaction → audit_logs shape) ─────────────────────────

class AuditLogSerializer(serializers.ModelSerializer):
    actor_id = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    action = serializers.SerializerMethodField()
    entity = serializers.SerializerMethodField()
    entity_id = serializers.CharField(source="reference_id", read_only=True)
    details = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = ["id", "actor_id", "actor_name", "action", "entity",
                  "entity_id", "details", "created_at"]

    def get_actor_id(self, obj):
        return str(obj.performed_by_id) if obj.performed_by_id else None

    def get_actor_name(self, obj):
        return obj.performed_by.get_full_name() if obj.performed_by else "System"

    def get_action(self, obj):
        return obj.get_transaction_type_display()

    def get_entity(self, obj):
        return obj.transaction_type.split("_")[0]

    def get_details(self, obj):
        return {"amount": float(obj.amount), "description": obj.description}


# ─── USER ROLE ───────────────────────────────────────────────────────────────

class UserRoleSerializer(serializers.Serializer):
    role = serializers.CharField()


# ─── SETTINGS ────────────────────────────────────────────────────────────────

class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoopSettings
        fields = [
            "coop_name", "coop_reg_number", "coop_address", "coop_phone",
            "coop_email", "monthly_contribution_amount", "max_loan_multiplier",
            "default_interest_rate", "late_payment_penalty_rate",
            "min_savings_for_loan", "min_months_for_loan",
        ]


# ─── EXCHANGE RATE ───────────────────────────────────────────────────────────

class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "currency_code", "currency_name", "rate_to_ngn", "updated_at"]


# ─── BANK ACCOUNT ────────────────────────────────────────────────────────────

class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "bank_code", "bank_name", "account_number", "account_name",
                  "is_verified", "is_default", "created_at"]


class TransactionSerializer(serializers.ModelSerializer):
    member_id = serializers.CharField(source="member.member_id", read_only=True)

    class Meta:
        model = Transaction
        fields = ["id", "transaction_id", "member_id", "transaction_type", "amount",
                  "description", "status", "reference_id", "date", "created_at"]


# ─── AUTH / USER ─────────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    """The 'user' object returned by auth endpoints (Supabase user shape)."""
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["id"] = str(instance.id)
        # Include member profile info
        try:
            member = instance.member_profile
            data["member_id"] = member.member_id
            data["is_admin"] = member.is_admin or instance.is_staff
        except Exception:
            data["member_id"] = None
            data["is_admin"] = instance.is_staff
        return data
